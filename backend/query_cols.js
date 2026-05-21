
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  // Get column info for key tables
  const cols=await p.$queryRawUnsafe("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('RAC_ProductPlan', 'RAC_ExternalPaymentLink', 'RAC_Invoice', 'RAC_Payment', 'RAC_CheckoutConfig', 'RAC_CheckoutOrder', 'RAC_CheckoutPayment') ORDER BY table_name, ordinal_position");
  let currentTable='';
  for (const c of cols) {
    if (c.table_name !== currentTable) {
      currentTable = c.table_name;
      console.log('\n' + currentTable + ':');
    }
    console.log('  ' + c.column_name + ' (' + c.data_type + ')');
  }
  
  await p.$disconnect();
})();
