
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const tables=await p.$queryRawUnsafe("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename ILIKE '%plan%' OR tablename ILIKE '%payment%' OR tablename ILIKE '%checkout%' OR tablename ILIKE '%invoice%' ORDER BY tablename");
  console.log('TABLES:', tables.map(t=>t.tablename));
  await p.$disconnect();
})();
