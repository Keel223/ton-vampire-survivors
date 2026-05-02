import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(req: Request) {
  try {
    const { seller_id, buyer_id, exp_amount, ton_cost } = await req.json();
    
    if (!seller_id || !buyer_id || !exp_amount || !ton_cost) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // 1. Проверяем наличие EXP у продавца
    const sellerExpStr = await redis.get(`player:${seller_id}:exp`);
    if (!sellerExpStr || Number(sellerExpStr) < Number(exp_amount)) {
      return NextResponse.json({ error: 'Not enough EXP' }, { status: 400 });
    }

    // 2. Выполняем транзакцию через Pipeline (атомарно)
    const pipeline = redis.pipeline();
    
    // Списываем EXP у продавца
    pipeline.decrby(`player:${seller_id}:exp`, Number(exp_amount));
    
    // Начисляем TON продавцу (90%)
    pipeline.incrbyfloat(`player:${seller_id}:ton`, Number(ton_cost) * 0.9);
    
    // Комиссия проекту (10%) - начисляем на системный аккаунт tg_id = 0
    pipeline.incrbyfloat(`player:0:ton`, Number(ton_cost) * 0.1);
    
    // Списываем TON у покупателя (проверку на баланс делайте на фронте/в бэкенде до вызова)
    pipeline.incrbyfloat(`player:${buyer_id}:ton`, -Number(ton_cost));
    
    // Начисляем EXP покупателю
    pipeline.incrby(`player:${buyer_id}:exp`, Number(exp_amount));

    const results = await pipeline.exec();

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
