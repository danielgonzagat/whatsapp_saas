import { kloelT } from '@/lib/i18n/t';
import { Bt, V } from '../product-nerve-center.shared';
import { DialogFrame } from '../ProductNerveCenterComissaoTab.richtext';

export function CoprodDeleteDialog({
  agentName,
  onClose,
  onDelete,
}: {
  agentName: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <DialogFrame
      title={kloelT(`Excluir coprodutor`)}
      description={[
        kloelT(`Esta ação remove `),
        agentName,
        kloelT(` da divisão atual de comissão.`),
      ].join('')}
      onClose={onClose}
      footer={
        <>
          <Bt onClick={onClose}>{kloelT(`Cancelar`)}</Bt>
          <Bt primary onClick={onDelete}>
            {kloelT(`Excluir`)}
          </Bt>
        </>
      }
    >
      <div style={{ fontSize: 12, color: V.t2, lineHeight: 1.5 }}>
        {kloelT(`Confirme para remover o vínculo de coprodução ou gerência deste produto.`)}
      </div>
    </DialogFrame>
  );
}
