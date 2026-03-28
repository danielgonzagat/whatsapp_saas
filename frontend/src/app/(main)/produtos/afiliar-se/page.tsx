'use client';
import dynamic from 'next/dynamic';
const ProdutosView = dynamic(() => import('@/components/kloel/produtos/ProdutosView'), { ssr: false });
export default function Page() { return <ProdutosView defaultTab="afiliar" />; }
