import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Camera, CheckCircle2, Clock3, XCircle, IdCard } from 'lucide-react';
import { api } from '../../lib/api';
import { compressImage } from '../../lib/compressImage';
import { Badge, Button, ErrorNote, toast } from '../../components/ui';

const STATUS = {
  PENDING: { tone: 'amber', icon: Clock3 },
  APPROVED: { tone: 'brand', icon: CheckCircle2 },
  REJECTED: { tone: 'red', icon: XCircle },
};

/** Upload satu dokumen (KTP atau SIM): kompres di browser -> kirim -> server simpan sebagai WebP privat. */
export function DocumentUpload({ type, doc }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const input = useRef(null);
  const [info, setInfo] = useState(null);

  const upload = useMutation({
    mutationFn: async (file) => {
      const compressed = await compressImage(file);
      setInfo({ before: file.size, after: compressed.size });
      const form = new FormData();
      form.append('type', type);
      form.append('file', compressed);
      return api('/documents', { method: 'POST', body: form });
    },
    onSuccess: () => {
      toast(t('account.docUploaded'));
      qc.invalidateQueries({ queryKey: ['my-docs'] });
    },
  });

  const st = doc ? STATUS[doc.status] : null;
  const kb = (n) => `${Math.round(n / 1024)} KB`;

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <IdCard className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900 dark:text-white">{t(`account.doc_${type}`)}</p>
          {st ? (
            <Badge tone={st.tone} className="mt-0.5"><st.icon className="h-3 w-3" />{t(`docStatus.${doc.status}`)}</Badge>
          ) : (
            <p className="text-xs text-slate-500">{t('account.docMissing')}</p>
          )}
        </div>
        {doc?.status !== 'APPROVED' && (
          <Button size="sm" variant={doc ? 'secondary' : 'primary'} loading={upload.isPending} onClick={() => input.current?.click()}>
            <Camera className="h-4 w-4" /> {doc ? t('account.reupload') : t('account.upload')}
          </Button>
        )}
      </div>
      {doc?.status === 'REJECTED' && doc.rejectReason && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{t('account.rejectReason')}: {doc.rejectReason}</p>}
      {info && upload.isSuccess && <p className="mt-2 text-xs text-slate-500">{t('account.compressed', { before: kb(info.before), after: kb(info.after) })}</p>}
      <ErrorNote className="mt-2" error={upload.error} />
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
