import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Sprite;
  monsters!: Phaser.Physics.Arcade.Group;
  weaponHitbox!: Phaser.GameObjects.Arc;
  exp: number = 0;
  expText!: Phaser.GameObjects.Text;
  isDead: boolean = false;
  attackTimer!: Phaser.Time.TimerEvent;

  constructor() { 
    super({ key: 'GameScene' }); 
  }

  create() {
    this.exp = 0;
    this.isDead = false;

    // Генерация пиксельных текстур (Красный квадрат - игрок, Зеленый - моб)
    const gfxPlayer = this.add.graphics();
    gfxPlayer.fillStyle(0xff0000, 1); gfxPlayer.fillRect(0, 0, 16, 16);
    gfxPlayer.generateTexture('player', 16, 16); gfxPlayer.destroy();

    const gfxMob = this.add.graphics();
    gfxMob.fillStyle(0x00ff00, 1); gfxMob.fillRect(0, 0, 12, 12);
    gfxMob.generateTexture('monster', 12, 12); gfxMob.destroy();

    // Игрок
    this.player = this.physics.add.sprite(180, 320, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setScale(2);
    this.player.setDepth(10);

    // Зона авто-атаки (желтый круг)
    this.weaponHitbox = this.add.circle(this.player.x, this.player.y, 50, 0xffff00, 0.3);
    this.physics.add.existing(this.weaponHitbox, true); // Статическое тело для физики

    // Группа монстров
    this.monsters = this.physics.add.group();

    // Спавн мобов каждые 800 мс
    this.time.addEvent({ delay: 800, callback: this.spawnMonster, callbackScope: this, loop: true });

    // Пульсация оружия (авто-атака)
    this.attackTimer = this.time.addEvent({
      delay: 500,
      callback: this.performAttack,
      callbackScope: this,
      loop: true
    });

    // Урон игроку от мобов
    this.physics.add.overlap(this.player, this.monsters, this.playerHit, undefined, this);

    // Текст EXP
    this.expText = this.add.text(10, 10, 'EXP: 0', { fontSize: '18px', color: '#fff', fontStyle: 'bold' });
    this.expText.setDepth(20);
    
    // Управление (мышь/тач)
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDead && pointer.isDown) {
        this.physics.moveToObject(this.player, pointer, 200);
      }
    });
  }

  update() {
    if (this.isDead) return;
    
    // Двигаем зону атаки за игроком
    this.weaponHitbox.setPosition(this.player.x, this.player.y);
    if (this.weaponHitbox.body) {
      (this.weaponHitbox.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    }

    // Мобы бегут за игроком
    this.monsters.getChildren().forEach((mob) => {
      this.physics.moveToObject(mob as Phaser.Physics.Arcade.Sprite, this.player, 60);
    });
  }

  spawnMonster() {
    if (this.isDead) return;
    // Спавн за краем экрана
    const side = Phaser.Math.Between(0, 3);
    let x, y;
    if (side === 0) { x = Phaser.Math.Between(0, 360); y = -20; }
    else if (side === 1) { x = Phaser.Math.Between(0, 360); y = 660; }
    else if (side === 2) { x = -20; y = Phaser.Math.Between(0, 640); }
    else { x = 380; y = Phaser.Math.Between(0, 640); }

    const mob = this.physics.add.sprite(x, y, 'monster');
    this.monsters.add(mob);
  }

  performAttack() {
    if (this.isDead) return;
    // Убиваем всех мобов в радиусе оружия
    const overlappingBodies = this.physics.overlapCircles(
      this.weaponHitbox.x, this.weaponHitbox.y, (this.weaponHitbox as any).radius,
      this.monsters
    );
    
    // Упрощенная логика урона
    const aliveMobs = this.monsters.getChildren().filter(m => m.active);
    aliveMobs.forEach(mob => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, mob.x, mob.y);
      if (dist < 60) { // Радиус атаки
        mob.destroy();
        this.exp += 10;
        this.expText.setText('EXP: ' + this.exp);
      }
    });
  }

  playerHit() {
    if (this.isDead) return;
    this.isDead = true;
    this.player.setTint(0x000000);
    this.physics.pause();
    this.attackTimer.remove();
    
    // Вызываем функцию сохранения из React
    if (this.game.registry.get('onGameEnd')) {
      this.game.registry.get('onGameEnd')(this.exp);
    }
  }
}
