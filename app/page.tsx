'use client';

import { useEffect, useState, useCallback } from 'react';
import { Game } from 'phaser';
import { GameScene } from '@/game/GameScene';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { redis } from '@/lib/redis'; // В реальном мире запросы к БД идут через API!

export default function Home() {
  const [gameInstance, setGameInstance] = useState<Game | null>(null);
  const [tonUI] = useTonConnectUI();
  const rawAddress = useTonAddress(false);
  
  const [tgId, setTgId] = useState<number>(0);
  const [exp, setExp] = useState<number>(0);
  const [tonBalance, setTonBalance] = useState<number>(0);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'dead'>('menu');

  // Инициализация Telegram Web App
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      const id = tg.initDataUnsafe?.user?.id || 999999; // Заглушка для локальной разработки
      setTgId(id);
      fetchPlayerData(id);
    } else {
      setTgId(999999); // Для запуска вне телеграма
      fetchPlayerData(999999);
    }
  }, []);

  // Загрузка данных из БД
  const fetchPlayerData = async (id: number) => {
    // ВНИМАНИЕ: Прямой вызов redis из клиента暴露ит токен!
    // В проде замените на fetch('/api/player?id=...')
    // Здесь для простоты используем заглушку или клиентский Redis (если разрешено)
    setExp(Number(await redis.get(`player:${id}:exp`) || 0));
    setTonBalance(Number(await redis.get(`player:${id}:ton`) || 0));
  };

  // Старт игры
  const startGame = useCallback(() => {
    if (gameInstance) gameInstance.destroy(true);

    const onGameEnd = async (earnedExp: number) => {
      if (earnedExp > 0) {
        await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tg_id: tgId, exp_earned: earnedExp })
        });
        setExp(prev => prev + earnedExp);
      }
      setGameState('dead');
    };

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 360,
      height: 640,
      parent: 'game-container',
      backgroundColor: '#1a1a2e',
      physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
      scene: new GameScene(onGameEnd),
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      callbacks: {
        postBoot: (game) => { game.registry.set('onGameEnd', onGameEnd); }
      }
    };

    setGameInstance(new Game(config));
    setGameState('playing');
  }, [tgId, gameInstance]);

  // Пополнение баланса (Через TON Connect)
  const topUp = (amount: number) => {
    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 60,
      messages: [
        {
          address: process.env.NEXT_PUBLIC_TON_WALLET!,
          amount: (amount * 1000000000).toString(), // TON в нанотонах
          comment: `deposit_${tgId}` // ID для зачисления
        }
      ]
    };
    tonUI.sendTransaction(transaction);
  };

  // Вывод TON (В реальном приложении нужна верификация через подпись TON Connect)
  // Здесь симуляция списания циферок
  const withdraw = async (amount: number) => {
    if (!rawAddress) { tonUI.openModal(); return; }
    if (tonBalance < amount) return;
    // В реальности: бэкенд проверяет подпись кошелька и отправляет TON с резерва
    await redis.incrbyfloat(`player:${tgId}:ton`, -amount);
    setTonBalance(prev => prev - amount);
    alert(`Заявка на вывод ${amount} TON на ${rawAddress} создана! (Симуляция)`);
  };

  // Симуляция P2P Покупки (вы покупаете EXP у бота tg_id=888)
  const buyExpOnMarket = async () => {
    if (tonBalance < 1) return alert('Недостаточно TON');
    await fetch('/api/market/sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seller_id: 888, buyer_id: tgId, exp_amount: 100, ton_cost: 1.0 })
    });
    fetchPlayerData(tgId);
    alert('Вы купили 100 EXP за 1 TON!');
  };

  return (
    <div className="relative w-[360px] h-[640px] bg-gray-800 flex flex-col overflow-hidden">
      
      {/* Игровое поле */}
      <div id="game-container" className="absolute inset-0 z-0"></div>

      {/* UI Сверху */}
      <div className="absolute top-0 left-0 right-0 p-2 bg-black/50 z-10 flex justify-between items-center">
        <div>
          <p className="text-yellow-400 font-bold">EXP: {exp}</p>
          <p className="text-blue-400 font-bold">TON: {tonBalance.toFixed(2)}</p>
        </div>
        <button onClick={() => rawAddress ? tonUI.disconnect() : tonUI.openModal()} className="bg-blue-600 px-2 py-1 rounded text-xs">
          {rawAddress ? 'Отключить' : 'Подключить TON'}
        </button>
      </div>

      {/* Экран меню/смерти */}
      {gameState !== 'playing' && (
        <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center gap-4 p-4">
          <h1 className="text-2xl font-bold text-red-500">Vampire Survivors</h1>
          
          {gameState === 'dead' && <p className="text-xl text-white">Вы погибли!</p>}

          <button onClick={startGame} className="bg-green-600 hover:bg-green-700 w-full py-2 rounded font-bold">
            {gameState === 'dead' ? 'Играть снова' : 'Начать игру'}
          </button>

          <div className="w-full border-t border-white/20 pt-4 mt-4">
            <h2 className="text-lg font-bold mb-2 text-center">Кошелек</h2>
            <div className="flex gap-2 mb-2">
              <button onClick={() => topUp(1)} className="bg-blue-600 px-3 py-1 rounded text-sm flex-1">+1 TON</button>
              <button onClick={() => topUp(5)} className="bg-blue-600 px-3 py-1 rounded text-sm flex-1">+5 TON</button>
              <button onClick={() => withdraw(1)} className="bg-red-600 px-3 py-1 rounded text-sm flex-1">-1 TON</button>
            </div>
          </div>

          <div className="w-full border-t border-white/20 pt-4 mt-2">
            <h2 className="text-lg font-bold mb-2 text-center">P2P Рынок</h2>
            <button onClick={buyExpOnMarket} className="bg-purple-600 hover:bg-purple-700 w-full py-2 rounded font-bold text-sm">
              Купить 100 EXP за 1 TON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
