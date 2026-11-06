/**
 * GST R1 output generators.
 * - generateGSTR1JSON: GSTN-compliant JSON string
 * - generateGSTR1Summary: CSV summary report
 */

import type { GSTR1Return } from './types';

/** Generates the final GSTN-compliant JSON */
export function generateGSTR1JSON(gstr1: GSTR1Return): string {
  const payload = {
    gstin: gstr1.gstin,
    fp: gstr1.fp,
    b2b: gstr1.b2b,
    b2cl: gstr1.b2cl,
    b2cs: gstr1.b2cs,
    cdnr: gstr1.cdnr,
    hsn: { data: gstr1.hsn },
    doc_issue: { doc_det: gstr1.docIssued },
  };
  return JSON.stringify(payload, null, 2);
}

/** Generates a CSV summary report */
export function generateGSTR1Summary(gstr1: GSTR1Return): string {
  const lines: string[] = [];

  lines.push(`GST R1 Summary Report`);
  lines.push(`GSTIN,${gstr1.gstin}`);
  lines.push(`Filing Period,${gstr1.fp}`);
  lines.push('');

  // B2B Section
  lines.push('B2B Invoices');
  lines.push('Buyer GSTIN,Invoice No,Date,Invoice Value,Taxable Value,IGST,CGST,SGST,CESS,POS,Reverse Charge');
  for (const buyer of gstr1.b2b) {
    for (const inv of buyer.inv) {
      for (const itm of inv.itms) {
        const d = itm.itm_det;
        lines.push([
          buyer.ctin,
          inv.inum,
          inv.idt,
          inv.val,
          d.txval,
          d.iamt ?? 0,
          d.camt ?? 0,
          d.samt ?? 0,
          d.csamt ?? 0,
          inv.pos,
          inv.rchrg,
        ].join(','));
      }
    }
  }
  lines.push('');

  // B2CL Section
  lines.push('B2C Large Invoices');
  lines.push('POS,Invoice No,Date,Invoice Value,Taxable Value,IGST,CESS');
  for (const posGroup of gstr1.b2cl) {
    for (const inv of posGroup.inv) {
      for (const itm of inv.itms) {
        const d = itm.itm_det;
        lines.push([
          posGroup.pos,
          inv.inum,
          inv.idt,
          inv.val,
          d.txval,
          d.iamt,
          d.csamt ?? 0,
        ].join(','));
      }
    }
  }
  lines.push('');

  // B2CS Section
  lines.push('B2C Small Summary');
  lines.push('Supply Type,GST Rate,POS,Taxable Value,IGST,CGST,SGST,CESS');
  for (const s of gstr1.b2cs) {
    lines.push([
      s.sply_ty,
      s.rt,
      s.pos,
      s.txval,
      s.iamt ?? 0,
      s.camt ?? 0,
      s.samt ?? 0,
      s.csamt ?? 0,
    ].join(','));
  }
  lines.push('');

  // CDNR Section
  lines.push('Credit/Debit Notes (Registered)');
  lines.push('Buyer GSTIN,Note Type,Note No,Date,Value,POS,Reverse Charge,Taxable Value,IGST,CGST,SGST');
  for (const buyer of gstr1.cdnr) {
    for (const nt of buyer.nt) {
      for (const itm of nt.itms) {
        const d = itm.itm_det;
        lines.push([
          buyer.ctin,
          nt.ntty === 'C' ? 'Credit Note' : 'Debit Note',
          nt.nt_num,
          nt.nt_dt,
          nt.val,
          nt.pos,
          nt.rchrg,
          d.txval,
          d.iamt ?? 0,
          d.camt ?? 0,
          d.samt ?? 0,
        ].join(','));
      }
    }
  }
  lines.push('');

  // HSN Summary
  lines.push('HSN Summary');
  lines.push('HSN Code,Description,UQC,Qty,Invoice Value,Taxable Value,IGST,CGST,SGST,CESS');
  for (const h of gstr1.hsn) {
    lines.push([
      h.hsn_sc,
      `"${h.desc.replace(/"/g, '""')}"`,
      h.uqc,
      h.qty,
      h.val,
      h.txval,
      h.iamt,
      h.camt,
      h.samt,
      h.csamt,
    ].join(','));
  }

  return lines.join('\n');
}
