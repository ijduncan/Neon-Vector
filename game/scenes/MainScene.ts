import { COLORS, SceneKeys, GAME_WIDTH, GAME_HEIGHT } from '../../types';

export class MainScene extends window.Phaser.Scene {
  private player!: any; 
  private cursors!: any;
  private wasd!: any;
  private heightKeys!: any;
  
  // Groups
  private playerBullets!: any;
  private enemyBullets!: any;
  private enemies!: any;
  private powerups!: any;
  private bossGroup!: any;
  
  // Boss
  private bossInstance: any = null;
  private isBossActive: boolean = false;
  private bossArrived: boolean = false;
  private bossHealth: number = 0;
  private bossMaxHealth: number = 600; 
  private bossSweepAngle: number = 0;
  private bossSweepDir: number = 1;
  private lastBossFired: number = 0;
  private readonly BOSS_SPAWN_TIME = 60000; 
  
  // Environment
  private starfield!: any;
  private scrollSpeed: number = 2;
  private isLowAltitude: boolean = false; 
  
  // State
  private lastFired: number = 0;
  private nextEnemySpawn: number = 0;
  private score: number = 0;
  private health: number = 100;
  private lives: number = 3;
  private gameActive: boolean = true;
  private matchStartTime: number = -1;

  // HUD
  private scoreText!: any;
  private livesText!: any;
  private enemiesPassedText!: any;
  private healthBar!: any;
  private altitudeText!: any;
  private progressBar!: any;
  private progressBarBg!: any;
  
  // Boss UI
  private bossHealthBg!: any;
  private bossHealthBar!: any;
  private bossLabel!: any;

  private readonly MAX_ENEMIES_PASSED = 10;
  private enemiesPassed: number = 0;
  private weaponLevel: number = 1;
  private difficultyMultiplier: number = 1;
  private onGameOver?: (score: number) => void;

  // Consistent HUD Styles
  private readonly UI_STYLE_CYAN = { 
    fontFamily: '"Share Tech Mono"', 
    fontSize: '18px', 
    color: '#00bcd4', 
    fontStyle: 'bold italic',
    padding: { x: 5, y: 5 }
  };
  private readonly UI_STYLE_YELLOW = { 
    fontFamily: '"Share Tech Mono"', 
    fontSize: '18px', 
    color: '#ffeb3b', 
    fontStyle: 'bold italic',
    padding: { x: 5, y: 5 }
  };

  constructor() {
    super({ key: SceneKeys.Main });
  }

  init(data: any) {
    this.onGameOver = data?.onGameOver || this.registry.get('onGameOver');
    this.score = 0;
    this.health = 100;
    this.lives = 3;
    this.gameActive = true;
    this.scrollSpeed = 2;
    this.enemiesPassed = 0;
    this.weaponLevel = 1;
    this.difficultyMultiplier = 1;
    this.isBossActive = false;
    this.bossArrived = false;
    this.matchStartTime = -1;
    this.isLowAltitude = false;
    this.bossInstance = null;
    this.bossSweepAngle = 0;
    this.bossSweepDir = 1;
    this.lastBossFired = 0;
  }

  create() {
    // 1. Background
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, COLORS.BG_DARK).setOrigin(0,0);
    const gridGraphics = this.add.graphics();
    gridGraphics.lineStyle(1, COLORS.GRID_COLOR, 0.4);
    for(let x = 0; x <= GAME_WIDTH; x+=50) { gridGraphics.moveTo(x, 0); gridGraphics.lineTo(x, GAME_HEIGHT); }
    gridGraphics.strokePath();
    gridGraphics.generateTexture('gridTex', GAME_WIDTH, GAME_HEIGHT);
    gridGraphics.destroy();
    this.starfield = this.add.tileSprite(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 'gridTex');
    this.starfield.setAlpha(0.6);

    // 2. Groups
    this.playerBullets = this.physics.add.group({ classType: window.Phaser.Physics.Arcade.Image, maxSize: 500 });
    this.enemyBullets = this.physics.add.group({ classType: window.Phaser.Physics.Arcade.Image, maxSize: 500 });
    this.enemies = this.physics.add.group();
    this.powerups = this.physics.add.group({ classType: window.Phaser.Physics.Arcade.Image });
    this.bossGroup = this.physics.add.group(); 

    // 3. Player
    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT - 100, 'playerShip');
    this.player.setCollideWorldBounds(true).setDrag(1000).setDepth(10);
    if (this.player.postFX) this.player.postFX.addBloom(COLORS.NEON_CYAN, 1, 1, 1.2);

    // 4. Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.heightKeys = this.input.keyboard.addKeys('P,L');

    // 5. Collisions
    this.physics.add.overlap(this.playerBullets, this.enemies, this.hitEnemy, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.crashEnemy, undefined, this);
    this.physics.add.overlap(this.player, this.enemyBullets, this.hitPlayer, undefined, this);
    this.physics.add.overlap(this.player, this.powerups, this.collectPowerup, undefined, this);
    
    this.physics.add.overlap(this.playerBullets, this.bossGroup, this.hitBoss, undefined, this);
    this.physics.add.overlap(this.player, this.bossGroup, (player: any, boss: any) => {
        if (!this.isLowAltitude) this.takeDamage(1);
    }, undefined, this);

    // 6. HUD
    const HUD_Y = 55;

    this.add.rectangle(10, HUD_Y + 15, 140, 10, 0x111111).setOrigin(0, 0.5).setStrokeStyle(2, 0x00bcd4).setDepth(20);
    this.healthBar = this.add.rectangle(10, HUD_Y + 15, 140, 10, COLORS.NEON_YELLOW).setOrigin(0, 0.5).setDepth(20);
    this.scoreText = this.add.text(10, HUD_Y + 28, 'SCORE: 0', this.UI_STYLE_CYAN).setDepth(20);

    this.enemiesPassedText = this.add.text(GAME_WIDTH - 10, HUD_Y + 15, `BREACH: 0/${this.MAX_ENEMIES_PASSED}`, this.UI_STYLE_CYAN).setOrigin(1, 0.5).setDepth(20);
    this.livesText = this.add.text(GAME_WIDTH - 10, HUD_Y + 38, `LIVES: ${this.lives}`, this.UI_STYLE_CYAN).setOrigin(1, 0.5).setDepth(20);

    this.altitudeText = this.add.text(10, GAME_HEIGHT - 15, 'ALT: HIGH', this.UI_STYLE_YELLOW).setOrigin(0, 1).setDepth(20);

    this.progressBarBg = this.add.rectangle(GAME_WIDTH / 2, HUD_Y + 10, 100, 4, 0x222222).setOrigin(0.5).setDepth(20);
    this.progressBar = this.add.rectangle(GAME_WIDTH / 2 - 50, HUD_Y + 10, 0, 4, COLORS.NEON_CYAN).setOrigin(0, 0.5).setDepth(20);

    this.bossHealthBg = this.add.rectangle(GAME_WIDTH / 2, 100, 200, 10, 0x000000).setOrigin(0.5).setStrokeStyle(2, 0xffeb3b).setDepth(25).setVisible(false);
    this.bossHealthBar = this.add.rectangle(GAME_WIDTH / 2 - 100, 100, 200, 10, 0xffeb3b).setOrigin(0, 0.5).setDepth(26).setVisible(false);
    this.bossLabel = this.add.text(GAME_WIDTH / 2, 85, 'BOSS_UNIT: DETECTED', { ...this.UI_STYLE_YELLOW, fontSize: '12px' }).setOrigin(0.5).setDepth(25).setVisible(false);
  }

  update(time: number, delta: number) {
    if (!this.gameActive) return;
    if (this.matchStartTime < 0) this.matchStartTime = time;
    const timeElapsed = time - this.matchStartTime;

    if (!this.isBossActive && time > this.nextEnemySpawn) {
        this.spawnWave();
        this.difficultyMultiplier = 1 + (timeElapsed / 60000);
        this.nextEnemySpawn = time + Math.max(300, 1800 / this.difficultyMultiplier);
    }

    if (!this.isBossActive) {
      const progress = Math.min(timeElapsed / this.BOSS_SPAWN_TIME, 1);
      this.progressBar.width = 100 * progress; 
      if (timeElapsed >= this.BOSS_SPAWN_TIME) {
          this.triggerBossSequence();
      }
    }

    this.starfield.tilePositionY -= this.scrollSpeed;
    this.handlePlayerControl();
    
    this.playerBullets.getChildren().forEach((b: any) => {
        if (b.active && (b.y < -100 || b.y > GAME_HEIGHT + 100 || b.x < -100 || b.x > GAME_WIDTH + 100)) {
            b.setActive(false).setVisible(false);
            b.body.stop();
        }
    });
    this.enemyBullets.getChildren().forEach((b: any) => {
        if (b.active && (b.y < -100 || b.y > GAME_HEIGHT + 100 || b.x < -100 || b.x > GAME_WIDTH + 100)) {
            b.setActive(false).setVisible(false);
            b.body.stop();
        }
    });
    
    this.powerups.getChildren().forEach((p: any) => {
      if (p.active) {
        p.y += 2 * (delta / 16);
        if (p.y > GAME_HEIGHT + 50) p.destroy();
      }
    });
    
    this.enemies.getChildren().forEach((e: any) => {
        if (e.active) {
            e.y += e.getData('speed') * (delta / 16);
            if (e.getData('type') === 'bomber' && time > e.getData('nextShot')) {
                this.enemyFire(e);
                e.setData('nextShot', time + Math.max(800, 2500 / this.difficultyMultiplier));
            }
            if (e.y > GAME_HEIGHT + 60) {
                e.setActive(false).setVisible(false).destroy();
                if (!this.isBossActive) {
                    this.enemiesPassed++;
                    this.enemiesPassedText.setText(`BREACH: ${this.enemiesPassed}/${this.MAX_ENEMIES_PASSED}`);
                    if (this.enemiesPassed >= this.MAX_ENEMIES_PASSED) this.takeDamage(100);
                }
            }
        }
    });

    if (this.isBossActive && this.bossArrived && this.bossInstance && this.bossInstance.active) {
        this.updateBoss(time, delta);
    }
  }

  private handlePlayerControl() {
    if (!this.player || !this.player.active) return;
    
    if (window.Phaser.Input.Keyboard.JustDown(this.heightKeys.P) && this.isLowAltitude) {
        this.isLowAltitude = false;
        this.scrollSpeed = 2;
        this.altitudeText.setText('ALT: HIGH').setColor('#ffeb3b');
        this.tweens.killTweensOf(this.player);
        this.tweens.add({ targets: this.player, scale: 1.0, alpha: 1.0, duration: 250, ease: 'Power2' });
    } else if (window.Phaser.Input.Keyboard.JustDown(this.heightKeys.L) && !this.isLowAltitude) {
        this.isLowAltitude = true;
        this.scrollSpeed = 1;
        this.altitudeText.setText('ALT: LOW').setColor('#00bcd4');
        this.tweens.killTweensOf(this.player);
        this.tweens.add({ targets: this.player, scale: 0.6, alpha: 0.7, duration: 250, ease: 'Power2' });
    }

    const baseSpeed = 400;
    const speed = this.isLowAltitude ? baseSpeed * 0.5 : baseSpeed;
    let velX = 0; let velY = 0;
    if (this.wasd.A.isDown || this.cursors.left.isDown) velX = -speed;
    else if (this.wasd.D.isDown || this.cursors.right.isDown) velX = speed;
    if (this.wasd.W.isDown || this.cursors.up.isDown) velY = -speed;
    else if (this.wasd.S.isDown || this.cursors.down.isDown) velY = speed;

    this.player.setVelocity(velX, velY);

    const isHighRate = this.weaponLevel % 2 === 0;
    const fireInterval = isHighRate ? 125 : 250;

    if (this.time.now > this.lastFired) {
        this.firePlayerBullet();
        this.lastFired = this.time.now + fireInterval;
    }
  }

  private firePlayerBullet() {
    const x = this.player.x;
    const y = this.player.y - 10;
    const speed = this.isLowAltitude ? -400 : -800;
    const create = (bx: number, by: number, vx: number) => {
        const b = this.playerBullets.get(bx, by, 'playerLaser');
        if (b) { 
          b.enableBody(true, bx, by, true, true); 
          b.setVelocity(vx, speed); 
          b.setData('isLow', this.isLowAltitude); 
          b.setScale(this.isLowAltitude ? 0.5 : 1); 
          b.setAlpha(this.isLowAltitude ? 0.6 : 1); 
          b.setDepth(16);
        }
    };
    
    if (this.weaponLevel <= 2) {
        create(x, y, 0);
    } 
    else if (this.weaponLevel <= 4) {
        create(x - 12, y, 0);
        create(x + 12, y, 0);
    }
    else if (this.weaponLevel <= 6) {
        create(x - 18, y, 0);
        create(x, y, 0);
        create(x + 18, y, 0);
    }
    else {
        create(x - 10, y, 0);
        create(x + 10, y, 0);
        create(x - 25, y, -120); 
        create(x + 25, y, 120);  
    }
  }

  private spawnWave() {
      const x = window.Phaser.Math.Between(50, GAME_WIDTH - 50);
      const isLow = Math.random() > 0.5;
      const type = Math.random() > 0.85 ? 'bomber' : 'dart';
      const enemy = this.enemies.create(x, -50, type === 'bomber' ? 'enemyBomber' : 'enemyDart');
      enemy.setData({ 
        isLow, 
        type, 
        hp: (type === 'bomber' ? 4 : 1) * Math.floor(this.difficultyMultiplier), 
        speed: (type === 'dart' ? 2.5 : 1) * (isLow ? 0.5 : 1),
        nextShot: this.time.now + window.Phaser.Math.Between(500, 1500)
      });
      enemy.setScale(isLow ? 0.5 : 1).setAlpha(isLow ? 0.6 : 1).setRotation(Math.PI);
      enemy.setDepth(12);
  }

  private hitEnemy(bullet: any, enemy: any) {
      if (bullet.getData('isLow') !== enemy.getData('isLow')) return;
      bullet.setActive(false).setVisible(false).disableBody(true, true);
      let hp = enemy.getData('hp') - 1; enemy.setData('hp', hp);
      if (hp <= 0) { 
          this.explode(enemy.x, enemy.y, COLORS.NEON_CYAN); 
          if (Math.random() < 0.2) this.spawnPowerup(enemy.x, enemy.y, enemy.getData('isLow'));
          enemy.destroy(); 
          this.score += 100; 
          this.scoreText.setText(`SCORE: ${this.score}`); 
      }
  }

  private spawnPowerup(x: number, y: number, isLow: boolean) {
    const type = Math.random() > 0.3 ? 'powerup' : 'healthup';
    const p = this.powerups.get(x, y, type);
    if (p) {
      p.enableBody(true, x, y, true, true);
      p.setData('isLow', isLow);
      p.setScale(isLow ? 0.6 : 1);
      p.setAlpha(isLow ? 0.6 : 1);
      p.setDepth(13);
    }
  }

  private triggerBossSequence() {
    if (this.isBossActive) return;
    this.isBossActive = true; 
    
    this.enemies.getChildren().forEach((e: any) => {
        if (e.active) {
            this.explode(e.x, e.y, COLORS.GRID_COLOR);
            e.destroy();
        }
    });

    const warn = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2, 'WARNING: BOSS APPROACHING', { fontFamily: '"Share Tech Mono"', fontSize: '28px', color: '#ffeb3b', fontStyle: 'bold italic' }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: warn, alpha: 0, duration: 400, yoyo: true, repeat: 7, onComplete: () => warn.destroy() });

    this.time.delayedCall(3200, () => {
      this.spawnBoss();
    });
  }

  private spawnBoss() {
    this.bossHealth = this.bossMaxHealth;
    this.bossInstance = this.physics.add.sprite(GAME_WIDTH/2, -150, 'bossShip');
    this.bossInstance.setRotation(Math.PI).setDepth(15);
    this.bossInstance.setImmovable(true);
    this.bossGroup.add(this.bossInstance);
    this.bossInstance.body.setCircle(60, 20, 10); 

    this.bossHealthBg.setVisible(true);
    this.bossHealthBar.setVisible(true);
    this.bossHealthBar.width = 200;
    this.bossLabel.setVisible(true);
    
    this.tweens.add({ 
        targets: this.bossInstance, 
        y: 180, 
        duration: 4000, 
        ease: 'Cubic.easeInOut',
        onComplete: () => {
            if (this.bossInstance && this.bossInstance.active) {
                this.bossArrived = true;
            }
        }
    });
  }

  private updateBoss(time: number, delta: number) {
      if (!this.bossInstance || !this.bossInstance.active) return;
      
      const targetX = (GAME_WIDTH/2) + Math.sin(time / 2000) * 140;
      this.bossInstance.x = targetX;
      this.bossInstance.body.updateFromGameObject();

      // Rotating sweep pattern back and forth
      const sweepSpeed = 0.04;
      this.bossSweepAngle += sweepSpeed * this.bossSweepDir;
      if (this.bossSweepAngle >= Math.PI) {
          this.bossSweepAngle = Math.PI;
          this.bossSweepDir = -1;
      } else if (this.bossSweepAngle <= 0) {
          this.bossSweepAngle = 0;
          this.bossSweepDir = 1;
      }
      
      // High frequency stream shooting in the current sweep angle
      if (time > this.lastBossFired) {
          const l = this.enemyBullets.get(this.bossInstance.x, this.bossInstance.y + 50, 'bossLaser');
          if (l) { 
            const projectileSpeed = 420;
            l.enableBody(true, l.x, l.y, true, true); 
            l.setVelocity(Math.cos(this.bossSweepAngle) * projectileSpeed, Math.sin(this.bossSweepAngle) * projectileSpeed); 
            l.setData('isLow', false); 
            l.setScale(1.5);
            l.setDepth(14);
          }
          this.lastBossFired = time + 85; 
      }
  }

  private hitBoss(bullet: any, boss: any) {
    if (bullet.getData('isLow')) return;
    bullet.setActive(false).setVisible(false).disableBody(true, true);
    if (!this.bossInstance || !this.bossInstance.active) return;
    
    this.bossHealth--;
    this.bossHealthBar.width = 200 * Math.max(0, this.bossHealth / this.bossMaxHealth);
    
    this.bossInstance.setTint(0xffffff);
    this.time.delayedCall(50, () => {
        if (this.bossInstance && this.bossInstance.active) this.bossInstance.clearTint();
    });

    if (this.bossHealth % 25 === 0) {
        this.explode(this.bossInstance.x + window.Phaser.Math.Between(-70,70), this.bossInstance.y + window.Phaser.Math.Between(-60,60), COLORS.NEON_YELLOW);
    }
    
    if (this.bossHealth <= 0) {
        this.killBoss();
    }
  }

  private killBoss() {
    this.bossArrived = false;
    this.explode(this.bossInstance.x, this.bossInstance.y, COLORS.NEON_YELLOW);
    
    for(let i=0; i<20; i++) {
        this.time.delayedCall(i * 150, () => {
            if (this.bossInstance) {
                this.explode(this.bossInstance.x + window.Phaser.Math.Between(-100, 100), this.bossInstance.y + window.Phaser.Math.Between(-80, 80), i % 3 === 0 ? COLORS.NEON_CYAN : COLORS.NEON_YELLOW);
            }
        });
    }
    
    this.tweens.add({ targets: this.bossInstance, alpha: 0, duration: 2500 });
    
    this.time.delayedCall(3000, () => {
        if (this.bossInstance) {
            this.bossInstance.destroy();
            this.bossInstance = null;
        }
    });

    this.bossHealthBg.setVisible(false);
    this.bossHealthBar.setVisible(false);
    this.bossLabel.setVisible(false);
    this.score += 50000;
    this.scoreText.setText(`SCORE: ${this.score}`);
    
    const winText = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2, 'THREAT NEUTRALIZED\nCORE ACCESS GRANTED', { 
        fontFamily: '"Share Tech Mono"', 
        fontSize: '32px', 
        color: '#00bcd4', 
        fontStyle: 'bold italic',
        align: 'center'
    }).setOrigin(0.5).setDepth(40);
    
    this.time.delayedCall(4500, () => {
        window.location.href = 'https://ianjamesduncan.com';
    });
  }

  private hitPlayer(player: any, bullet: any) {
      if (this.isLowAltitude !== bullet.getData('isLow')) return;
      bullet.setActive(false).setVisible(false).disableBody(true, true);
      this.takeDamage(10);
  }
  
  private crashEnemy(player: any, enemy: any) {
      if (this.isLowAltitude !== enemy.getData('isLow')) return;
      this.takeDamage(20); this.explode(enemy.x, enemy.y, COLORS.NEON_YELLOW); enemy.destroy();
  }
  
  private takeDamage(amount: number) {
      this.health -= amount; this.cameras.main.shake(100, 0.01);
      this.healthBar.width = 140 * Math.max(0, this.health / 100);
      if (this.health <= 0) this.handleDeath();
  }

  private handleDeath() {
    this.lives--; this.livesText.setText(`LIVES: ${this.lives}`);
    this.weaponLevel = Math.max(1, this.weaponLevel - 2); 
    if (this.lives > 0) { 
        this.health = 100; 
        this.healthBar.width = 140; 
        this.player.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 100);
        this.isLowAltitude = false;
        this.player.setScale(1).setAlpha(1);
        this.altitudeText.setText('ALT: HIGH').setColor('#ffeb3b');
        this.player.setAlpha(0.5);
        this.time.delayedCall(2000, () => this.player.setAlpha(1));
    }
    else this.gameOver();
  }

  private explode(x: number, y: number, color: number) {
      const p = this.add.particles(x, y, 'spark', { speed: { min: 60, max: 250 }, lifespan: 600, quantity: 25, tint: color, scale: { start: 1, end: 0 } });
      this.time.delayedCall(600, () => p.destroy());
  }

  private enemyFire(e: any) {
      if (!this.player || !this.player.active) return;
      const b = this.enemyBullets.get(e.x, e.y + 20, 'enemyPlasma');
      if (b) { 
        const isLow = e.getData('isLow');
        const angle = window.Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
        const speed = isLow ? 180 : 350;
        b.enableBody(true, e.x, e.y + 20, true, true); 
        b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed); 
        b.setData('isLow', isLow); 
        b.setScale(isLow ? 0.5 : 1); 
        b.setAlpha(isLow ? 0.4 : 1);
        b.setDepth(11);
      }
  }

  private collectPowerup(player: any, power: any) {
      if (this.isLowAltitude !== power.getData('isLow')) return;
      if (power.texture.key === 'healthup') {
        this.health = Math.min(100, this.health + 30);
        this.healthBar.width = 140 * (this.health / 100);
      } else {
        this.weaponLevel = Math.min(8, this.weaponLevel + 1); 
      }
      this.score += 500;
      this.scoreText.setText(`SCORE: ${this.score}`);
      power.destroy();
  }

  private gameOver() { this.gameActive = false; if (this.onGameOver) this.onGameOver(this.score); }
}