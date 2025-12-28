import { COLORS, SceneKeys } from '../../types';

export class BootScene extends window.Phaser.Scene {
  constructor() {
    super({ key: SceneKeys.Boot });
  }

  preload() {
    // 1. Generate Player Ship (Cyan outline, Yellow core)
    const playerShip = this.make.graphics({ x: 0, y: 0 });
    playerShip.lineStyle(3, COLORS.NEON_CYAN);
    playerShip.fillStyle(0x000000, 0.9);
    playerShip.beginPath();
    playerShip.moveTo(30, 5); 
    playerShip.lineTo(45, 25);
    playerShip.lineTo(55, 50); 
    playerShip.lineTo(40, 45); 
    playerShip.lineTo(38, 55); 
    playerShip.lineTo(22, 55); 
    playerShip.lineTo(20, 45); 
    playerShip.lineTo(5, 50); 
    playerShip.lineTo(15, 25);
    playerShip.closePath();
    playerShip.fillPath();
    playerShip.strokePath();
    // Engine Glow
    playerShip.fillStyle(COLORS.NEON_YELLOW, 1);
    playerShip.fillCircle(30, 48, 4);
    playerShip.generateTexture('playerShip', 60, 60);

    // 2. Generate Enemy: "Dart" (Yellow outline)
    const enemyDart = this.make.graphics({ x: 0, y: 0 });
    enemyDart.lineStyle(2, COLORS.NEON_YELLOW);
    enemyDart.fillStyle(0x000000, 0.9);
    enemyDart.beginPath();
    enemyDart.moveTo(20, 5);   
    enemyDart.lineTo(35, 35); 
    enemyDart.lineTo(20, 25); 
    enemyDart.lineTo(5, 35);  
    enemyDart.closePath();
    enemyDart.fillPath();
    enemyDart.strokePath();
    enemyDart.generateTexture('enemyDart', 40, 40);

    // 3. Generate Enemy: "Bomber" (Thick Yellow/Cyan mix)
    const enemyBomber = this.make.graphics({ x: 0, y: 0 });
    enemyBomber.lineStyle(2, COLORS.NEON_YELLOW);
    enemyBomber.fillStyle(0x000000, 0.9);
    enemyBomber.beginPath();
    enemyBomber.moveTo(30, 5);   
    enemyBomber.lineTo(45, 15);
    enemyBomber.lineTo(55, 45);  
    enemyBomber.lineTo(35, 55);  
    enemyBomber.lineTo(25, 55);  
    enemyBomber.lineTo(5, 45);   
    enemyBomber.lineTo(15, 15);
    enemyBomber.closePath();
    enemyBomber.fillPath();
    enemyBomber.strokePath();
    enemyBomber.fillStyle(COLORS.NEON_CYAN, 0.4);
    enemyBomber.fillCircle(30, 30, 10);
    enemyBomber.generateTexture('enemyBomber', 60, 60);

    // 4. Projectiles
    const pLaser = this.make.graphics({ x: 0, y: 0 });
    pLaser.fillStyle(COLORS.NEON_CYAN);
    pLaser.fillRect(0, 0, 4, 20);
    pLaser.fillStyle(0xffffff, 0.8);
    pLaser.fillRect(1, 1, 2, 18);
    pLaser.generateTexture('playerLaser', 4, 20);

    const ePlasma = this.make.graphics({ x: 0, y: 0 });
    ePlasma.fillStyle(COLORS.NEON_YELLOW);
    ePlasma.fillCircle(5, 5, 5);
    ePlasma.generateTexture('enemyPlasma', 10, 10);

    // 5. Star/Grid
    const star = this.make.graphics({ x: 0, y: 0 });
    star.fillStyle(COLORS.NEON_YELLOW, 0.3);
    star.fillCircle(2, 2, 2);
    star.generateTexture('star', 4, 4);
    
    // 6. Particle
    const spark = this.make.graphics({ x: 0, y: 0 });
    spark.fillStyle(COLORS.NEON_CYAN);
    spark.fillRect(0,0, 2, 2);
    spark.generateTexture('spark', 2, 2);

    // 7. PowerUps (Cyan P)
    const powerup = this.make.graphics({ x: 0, y: 0 });
    powerup.lineStyle(2, COLORS.NEON_CYAN);
    powerup.fillStyle(0x000000, 0.9);
    powerup.strokeRect(0, 0, 24, 24);
    powerup.fillRect(0, 0, 24, 24);
    powerup.beginPath();
    powerup.moveTo(9, 6);
    powerup.lineTo(9, 18); 
    powerup.moveTo(9, 6);
    powerup.lineTo(15, 6);
    powerup.lineTo(15, 12);
    powerup.lineTo(9, 12); 
    powerup.strokePath();
    powerup.generateTexture('powerup', 24, 24);

    // 8. Health PowerUp (Yellow Cross)
    const healthup = this.make.graphics({ x: 0, y: 0 });
    healthup.lineStyle(2, COLORS.NEON_YELLOW);
    healthup.fillStyle(0x000000, 0.9);
    healthup.strokeRect(0, 0, 24, 24);
    healthup.fillRect(0, 0, 24, 24);
    healthup.fillStyle(COLORS.NEON_YELLOW);
    healthup.fillRect(10, 5, 4, 14); 
    healthup.fillRect(5, 10, 14, 4); 
    healthup.generateTexture('healthup', 24, 24);

    // 9. BOSS SHIP (Vibrant Yellow/Cyan mix)
    const boss = this.make.graphics({ x: 0, y: 0 });
    boss.lineStyle(4, COLORS.NEON_YELLOW);
    boss.fillStyle(0x000000, 0.9);
    boss.beginPath();
    boss.moveTo(80, 0);
    boss.lineTo(120, 40);
    boss.lineTo(160, 20);
    boss.lineTo(140, 100);
    boss.lineTo(80, 140);
    boss.lineTo(20, 100);
    boss.lineTo(0, 20);
    boss.lineTo(40, 40);
    boss.closePath();
    boss.fillPath();
    boss.strokePath();
    boss.fillStyle(COLORS.NEON_CYAN, 1);
    boss.fillCircle(80, 70, 20);
    boss.generateTexture('bossShip', 160, 140);

    // 10. BOSS Laser
    const bLaser = this.make.graphics({ x: 0, y: 0 });
    bLaser.fillStyle(COLORS.NEON_CYAN);
    bLaser.fillCircle(10, 10, 10);
    bLaser.generateTexture('bossLaser', 20, 20);
  }

  create() {
    this.scene.start(SceneKeys.Main);
  }
}