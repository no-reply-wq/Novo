'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { BuilderProvider, useBuilder, useSelectedBlock } from '@/lib/page-builder/context';
import { PageRenderer } from './BlockRenderer';
import {
  BLOCK_LIBRARY, BlockType, PageLayoutConfig, CanvasBlock,
  TextProps, HeadingProps, ButtonProps, ImageProps,
  StatCardProps, FormEmbedProps, TableEmbedProps, DividerProps, SpacerProps,
  SectionProps, ContainerProps, BlockStyles, Breakpoint,
} from '@/lib/page-builder/types';

interface Props {
  tenantSlug: string;
  initialLayout: PageLayoutConfig;
  forms: Array<{ id: string; name: string; slug: string }>;
  tables: string[];
  onSave: (layout: PageLayoutConfig) => Promise<void>;
}

export function PageBuilderEditor(props: Props) {
  return (
    <BuilderProvider initialLayout={props.initialLayout}>
      <EditorInner {...props} />
    </BuilderProvider>
  );
}

function EditorInner({ tenantSlug, forms, tables, onSave }: Props) {
  const { state, addBlock, deleteBlock, selectBlock, undo, redo, canUndo, canRedo, setBreakpoint, updateProps, updateStyles } = useBuilder();
  const [saving, setSaving] = useState(false);
  const [activePanel, setActivePanel] = useState<'blocks'|'layers'|'inspector'>('blocks');
  const [dragOver, setDragOver] = useState(false);

  async function handleSave() {
    setSaving(true);
    try { await onSave(state.layout); } finally { setSaving(false); }
  }

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const bt = e.dataTransfer.getData('blockType') as BlockType;
    if (bt) addBlock(bt, null);
  }, [addBlock]);

  const bpW: Record<Breakpoint,string> = { desktop:'100%', tablet:'768px', mobile:'390px' };

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'system-ui,sans-serif', fontSize:'13px' }}>

      {/* Left Panel */}
      <div style={{ width:'260px', backgroundColor:'#1e293b', color:'#f1f5f9', display:'flex', flexDirection:'column', flexShrink:0, borderRight:'1px solid #334155' }}>
        <div style={{ display:'flex', borderBottom:'1px solid #334155' }}>
          {(['blocks','layers','inspector'] as const).map(p => (
            <button key={p} onClick={() => setActivePanel(p)} style={{ flex:1, padding:'10px 4px', border:'none', cursor:'pointer', fontSize:'11px', fontWeight:'600', backgroundColor:activePanel===p?'#334155':'transparent', color:activePanel===p?'#a5b4fc':'#64748b' }}>
              {p==='blocks'?'Blocks':p==='layers'?'Layers':'Inspector'}
            </button>
          ))}
        </div>
        <div style={{ flex:1, overflow:'auto' }}>
          {activePanel==='blocks' && <BlockLibraryPanel />}
          {activePanel==='layers' && <LayersPanel />}
          {activePanel==='inspector' && (
            <InspectorPanel forms={forms} tables={tables} tenantSlug={tenantSlug}
              onUpdateProps={(id,p) => updateProps(id,p)}
              onUpdateStyles={(id,s) => updateStyles(id,s)}
              breakpoint={state.breakpoint}
            />
          )}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', backgroundColor:'#e2e8f0' }}>
        {/* Toolbar */}
        <div style={{ height:'48px', backgroundColor:'#0f172a', display:'flex', alignItems:'center', padding:'0 16px', gap:'8px', flexShrink:0, borderBottom:'1px solid #1e293b' }}>
          <div style={{ display:'flex', gap:'2px', backgroundColor:'#1e293b', borderRadius:'8px', padding:'3px' }}>
            {(['desktop','tablet','mobile'] as Breakpoint[]).map(bp => (
              <button key={bp} onClick={() => setBreakpoint(bp)} style={{ padding:'4px 10px', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'11px', backgroundColor:state.breakpoint===bp?'#6366f1':'transparent', color:state.breakpoint===bp?'#fff':'#64748b' }}>
                {bp}
              </button>
            ))}
          </div>
          <div style={{ flex:1 }} />
          <button onClick={undo} disabled={!canUndo} style={{ padding:'6px 10px', border:'none', borderRadius:'6px', cursor:canUndo?'pointer':'not-allowed', backgroundColor:'transparent', color:canUndo?'#cbd5e1':'#475569', fontSize:'16px' }}>&#8617;</button>
          <button onClick={redo} disabled={!canRedo} style={{ padding:'6px 10px', border:'none', borderRadius:'6px', cursor:canRedo?'pointer':'not-allowed', backgroundColor:'transparent', color:canRedo?'#cbd5e1':'#475569', fontSize:'16px' }}>&#8618;</button>
          <div style={{ width:'1px', height:'20px', backgroundColor:'#334155' }} />
          {state.selectedBlockId && (
            <button onClick={() => deleteBlock(state.selectedBlockId!)} style={{ padding:'6px 12px', border:'1px solid #ef4444', borderRadius:'6px', cursor:'pointer', backgroundColor:'transparent', color:'#ef4444', fontSize:'12px' }}>Delete</button>
          )}
          <button onClick={handleSave} disabled={saving} style={{ padding:'6px 16px', border:'none', borderRadius:'6px', cursor:'pointer', backgroundColor:'#6366f1', color:'#fff', fontSize:'13px', fontWeight:'600' }}>
            {saving?'Saving...':'Save'}
          </button>
        </div>

        {/* Canvas drop zone */}
        <div style={{ flex:1, overflow:'auto', display:'flex', justifyContent:'center', padding:'24px' }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleCanvasDrop}
            style={{ width:bpW[state.breakpoint], maxWidth:'100%', backgroundColor:'#fff', minHeight:'600px', borderRadius:'12px', boxShadow:dragOver?'0 0 0 3px #6366f1,0 8px 32px rgba(0,0,0,0.15)':'0 4px 24px rgba(0,0,0,0.12)', overflow:'hidden', transition:'all 0.3s' }}
          >
            <PageRenderer
              layout={state.layout}
              breakpoint={state.breakpoint}
              isEditing={true}
              selectedBlockId={state.selectedBlockId}
              onSelect={id => { selectBlock(id); if (id) setActivePanel('inspector'); }}
              tenantSlug={tenantSlug}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockLibraryPanel() {
  const { addBlock, state } = useBuilder();
  const cats = ['layout','content','media','data','advanced'] as const;
  const [exp, setExp] = useState<Record<string,boolean>>({ layout:true, content:true, data:true, media:false, advanced:false });
  const icons: Record<string,string> = { section:'Section', container:'Container', card:'Card', heading:'Heading', text:'Text', button:'Button', 'stat-card':'Stat Card', divider:'Divider', spacer:'Spacer', image:'Image', 'image-carousel':'Carousel', 'form-embed':'Form', 'table-embed':'Table', html:'HTML' };

  return (
    <div style={{ padding:'8px' }}>
      <p style={{ fontSize:'11px', color:'#64748b', padding:'4px 8px 8px', margin:0 }}>Click or drag to add</p>
      {cats.map(cat => {
        const items = BLOCK_LIBRARY.filter(b => b.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat} style={{ marginBottom:'4px' }}>
            <button onClick={() => setExp(p => ({ ...p, [cat]:!p[cat] }))} style={{ width:'100%', display:'flex', alignItems:'center', gap:'6px', padding:'6px 8px', border:'none', borderRadius:'6px', cursor:'pointer', backgroundColor:'transparent', color:'#94a3b8', fontSize:'10px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.08em' }}>
              <span style={{ marginLeft:'auto', display:'inline-block', transform:exp[cat]?'rotate(90deg)':'none', transition:'transform 0.15s' }}>&#8250;</span>
              {cat}
            </button>
            {exp[cat] && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px', marginTop:'4px', marginBottom:'8px' }}>
                {items.map(item => (
                  <button key={item.type} draggable
                    onDragStart={e => e.dataTransfer.setData('blockType', item.type)}
                    onClick={() => addBlock(item.type as BlockType, state.selectedBlockId)}
                    style={{ padding:'10px 8px', border:'1px solid #334155', borderRadius:'6px', cursor:'grab', backgroundColor:'#0f172a', color:'#cbd5e1', fontSize:'11px', textAlign:'center' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor='#334155'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor='#0f172a'; }}
                  >
                    {icons[item.type] ?? item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LayersPanel() {
  const { state, selectBlock } = useBuilder();
  function renderItem(id: string, depth = 0): React.ReactNode {
    const b = state.layout.blocks[id];
    if (!b) return null;
    const sel = state.selectedBlockId === id;
    return (
      <div key={id}>
        <div onClick={() => selectBlock(id)} style={{ padding:`5px 8px 5px ${8+depth*14}px`, cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', backgroundColor:sel?'#312e81':'transparent', borderRadius:'4px', color:sel?'#c7d2fe':'#94a3b8', fontSize:'12px' }}>
          <span style={{ flex:1 }}>{b.label ?? b.type}</span>
          {b.hidden && <span style={{ fontSize:'10px', opacity:0.5 }}>hidden</span>}
        </div>
        {b.children.map(c => renderItem(c, depth+1))}
      </div>
    );
  }
  return (
    <div style={{ padding:'8px' }}>
      {state.layout.rootIds.length === 0
        ? <p style={{ color:'#64748b', fontSize:'12px', textAlign:'center', padding:'16px' }}>No blocks yet</p>
        : state.layout.rootIds.map(id => renderItem(id))}
    </div>
  );
}

function InspectorPanel({ forms, tables, tenantSlug, onUpdateProps, onUpdateStyles, breakpoint }: {
  forms: Array<{id:string;name:string;slug:string}>;
  tables: string[];
  tenantSlug: string;
  onUpdateProps: (id:string, p:Record<string,unknown>) => void;
  onUpdateStyles: (id:string, s:Partial<BlockStyles>) => void;
  breakpoint: Breakpoint;
}) {
  const block = useSelectedBlock();
  const [tab, setTab] = useState<'content'|'style'>('content');
  const [tableCols, setTableCols] = useState<string[]>([]);

  useEffect(() => {
    const p = block?.props as TableEmbedProps;
    if (block?.type === 'table-embed') {
      if (p?.sourceTable && tenantSlug) {
        fetch(`/api/tenant/ui-builder/widget-data?tenant=${tenantSlug}&table=${p.sourceTable}&pageSize=3`)
          .then(r => r.json()).then(d => {
            const rows = d.rows ?? d.data ?? d.submissions ?? [];
            if (rows[0]) setTableCols(Object.keys(rows[0]));
          }).catch(() => {});
      } else if (p?.formId && tenantSlug) {
        fetch(`/api/tenant/form-builder/submissions?tenant=${tenantSlug}&formId=${p.formId}&page=1&pageSize=3`)
          .then(r => r.json()).then(d => {
            const rows = d.submissions ?? d.rows ?? d.data ?? [];
            if (rows[0]) setTableCols(Object.keys(rows[0]));
            else {
              // Fall back to form fields as column names
              fetch(`/api/tenant/form-builder/${p.formId}/fields?tenant=${tenantSlug}`)
                .then(r => r.json()).then(fd => {
                  const cols = (fd.fields ?? []).map((f: {field_key?: string; label?: string}) => f.field_key ?? f.label ?? '').filter(Boolean);
                  setTableCols(cols);
                }).catch(() => {});
            }
          }).catch(() => {});
      } else {
        setTableCols([]);
      }
    } else {
      setTableCols([]);
    }
  }, [block?.id, (block?.props as TableEmbedProps)?.sourceTable, (block?.props as TableEmbedProps)?.formId, tenantSlug]);

  if (!block) return (
    <div style={{ padding:'24px', textAlign:'center' }}>
      <p style={{ color:'#64748b', fontSize:'13px' }}>Select a block to edit it</p>
    </div>
  );

  const up = (p: Record<string,unknown>) => onUpdateProps(block.id, p);
  const us = (s: Partial<BlockStyles>) => onUpdateStyles(block.id, s);
  const styles = block.styles[breakpoint] ?? {};

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ padding:'10px 12px', borderBottom:'1px solid #334155', fontSize:'12px', fontWeight:'600', color:'#e2e8f0' }}>
        {block.label ?? block.type}
      </div>
      <div style={{ display:'flex', borderBottom:'1px solid #334155' }}>
        {(['content','style'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:'8px 4px', border:'none', cursor:'pointer', fontSize:'11px', fontWeight:'600', backgroundColor:tab===t?'#334155':'transparent', color:tab===t?'#a5b4fc':'#64748b', textTransform:'capitalize' }}>{t}</button>
        ))}
      </div>
      <div style={{ flex:1, overflow:'auto', padding:'12px' }}>
        {tab === 'content' && <ContentFields block={block} forms={forms} tables={tables} tableCols={tableCols} up={up} />}
        {tab === 'style' && <StyleFields styles={styles} us={us} />}
      </div>
    </div>
  );
}

function ContentFields({ block, forms, tables, tableCols, up }: {
  block: CanvasBlock; forms: Array<{id:string;name:string;slug:string}>; tables: string[]; tableCols: string[]; up: (p:Record<string,unknown>) => void;
}) {
  switch (block.type) {
    case 'heading': {
      const p = block.props as HeadingProps;
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <Field label="Text"><textarea value={p.content??''} onChange={e => up({content:e.target.value})} style={TA} rows={3} /></Field>
          <Field label="Level">
            <select value={p.level??2} onChange={e => up({level:Number(e.target.value)})} style={SEL}>
              {[1,2,3,4,5,6].map(l => <option key={l} value={l}>H{l}</option>)}
            </select>
          </Field>
        </div>
      );
    }
    case 'text': {
      const p = block.props as TextProps;
      return <Field label="Content"><textarea value={p.content??''} onChange={e => up({content:e.target.value})} style={TA} rows={5} /></Field>;
    }
    case 'button': {
      const p = block.props as ButtonProps;
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <Field label="Label"><input value={p.label??''} onChange={e => up({label:e.target.value})} style={INP} /></Field>
          <Field label="Action on click">
            <select value={p.action??'link'} onChange={e => up({action:e.target.value})} style={SEL}>
              <option value="link">Open URL</option>
              <option value="popup-form">Open form in popup</option>
              <option value="submit">Submit parent form</option>
            </select>
          </Field>
          {(!p.action || p.action==='link') && (
            <Field label="URL"><input value={p.href??''} onChange={e => up({href:e.target.value})} style={INP} placeholder="https://" /></Field>
          )}
          {p.action==='popup-form' && (
            <Field label="Form to open">
              <select value={p.formId??''} onChange={e => up({formId:e.target.value})} style={SEL}>
                <option value="">-- select form --</option>
                {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              {p.formId && <p style={{ margin:'4px 0 0', fontSize:'11px', color:'#6366f1' }}>Popup will open: {forms.find(f=>f.id===p.formId)?.name}</p>}
            </Field>
          )}
          <Field label="Style">
            <select value={p.variant??'primary'} onChange={e => up({variant:e.target.value})} style={SEL}>
              {['primary','secondary','outline','ghost'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Size">
            <select value={p.size??'md'} onChange={e => up({size:e.target.value})} style={SEL}>
              {['sm','md','lg'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      );
    }
    case 'image': {
      const p = block.props as ImageProps;
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <Field label="Image URL"><input value={p.src??''} onChange={e => up({src:e.target.value})} style={INP} placeholder="https://..." /></Field>
          <Field label="Alt text"><input value={p.alt??''} onChange={e => up({alt:e.target.value})} style={INP} /></Field>
          <Field label="Fit">
            <select value={p.objectFit??'cover'} onChange={e => up({objectFit:e.target.value})} style={SEL}>
              {['cover','contain','fill'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
        </div>
      );
    }
    case 'stat-card': {
      const p = block.props as StatCardProps;
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <Field label="Title"><input value={p.title??''} onChange={e => up({title:e.target.value})} style={INP} placeholder="Total Revenue" /></Field>
          <Field label="Value"><input value={p.value??''} onChange={e => up({value:e.target.value})} style={INP} placeholder="1,20,000" /></Field>
          <Field label="Unit"><input value={p.unit??''} onChange={e => up({unit:e.target.value})} style={INP} placeholder="INR" /></Field>
          <Field label="Trend">
            <select value={p.trend??'neutral'} onChange={e => up({trend:e.target.value})} style={SEL}>
              <option value="up">Up</option><option value="down">Down</option><option value="neutral">Neutral</option>
            </select>
          </Field>
          <Field label="Trend value"><input value={p.trendValue??''} onChange={e => up({trendValue:e.target.value})} style={INP} placeholder="+12%" /></Field>
          <Field label="Value color"><input type="color" value={p.color??'#111827'} onChange={e => up({color:e.target.value})} style={{...INP,height:'36px',padding:'2px'}} /></Field>
        </div>
      );
    }
    case 'form-embed': {
      const p = block.props as FormEmbedProps;
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <Field label="Select Form">
            <select value={p.formId??''} onChange={e => up({formId:e.target.value})} style={SEL}>
              <option value="">-- choose a form --</option>
              {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          {p.formId && (
            <>
              <label style={{ display:'flex', alignItems:'center', gap:'6px', color:'#cbd5e1', cursor:'pointer', fontSize:'12px' }}>
                <input type="checkbox" checked={p.showTitle??true} onChange={e => up({showTitle:e.target.checked})} />
                Show form title
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:'6px', color:'#cbd5e1', cursor:'pointer', fontSize:'12px' }}>
                <input type="checkbox" checked={p.compact??false} onChange={e => up({compact:e.target.checked})} />
                Compact layout
              </label>
              <div style={{ padding:'10px', backgroundColor:'#0f172a', borderRadius:'6px', border:'1px solid #334155' }}>
                <p style={{ margin:0, fontSize:'11px', color:'#6366f1', fontWeight:'600' }}>Form linked: {forms.find(f=>f.id===p.formId)?.name}</p>
              </div>
            </>
          )}
        </div>
      );
    }
    case 'table-embed': {
      const p = block.props as TableEmbedProps;
      const selCols: string[] = (p.columns??[]).map((c:{key:string}) => c.key);
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <Field label="Table title"><input value={p.title??''} onChange={e => up({title:e.target.value})} style={INP} /></Field>

          <Field label="Data source (DB table)">
            <select value={p.sourceTable??''} onChange={e => { up({sourceTable:e.target.value||undefined, formId:undefined, columns:[]}); }} style={SEL}>
              <option value="">-- select table --</option>
              {tables.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <p style={{ margin:'0', fontSize:'10px', color:'#64748b' }}>OR show form submissions:</p>
          <Field label="Form submissions">
            <select value={p.formId??''} onChange={e => up({formId:e.target.value||undefined, sourceTable:undefined, columns:[]})} style={SEL}>
              <option value="">-- select form --</option>
              {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>

          {tableCols.length > 0 && (
            <Field label="Columns to display">
              <div style={{ backgroundColor:'#0f172a', borderRadius:'6px', padding:'8px', border:'1px solid #334155', maxHeight:'200px', overflow:'auto' }}>
                {tableCols.map(col => {
                  const checked = selCols.includes(col);
                  const colDef = (p.columns??[]).find((c:{key:string}) => c.key===col);
                  return (
                    <div key={col} style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'4px' }}>
                      <input type="checkbox" checked={checked} onChange={e => {
                        const existing = p.columns ?? [];
                        const newCols = e.target.checked
                          ? [...existing, {key:col, label:col}]
                          : existing.filter((c:{key:string}) => c.key!==col);
                        up({columns:newCols});
                      }} />
                      <span style={{ flex:1, color:'#cbd5e1', fontSize:'11px' }}>{col}</span>
                      {checked && (
                        <input value={colDef?.label??col} onChange={e => {
                          const newCols = (p.columns??[]).map((c:{key:string,label:string}) => c.key===col?{...c,label:e.target.value}:c);
                          up({columns:newCols});
                        }} style={{...INP, width:'80px', padding:'2px 6px', fontSize:'11px'}} placeholder="Header" />
                      )}
                    </div>
                  );
                })}
              </div>
            </Field>
          )}

          {!tableCols.length && (p.sourceTable || p.formId) && (
            <p style={{ fontSize:'11px', color:'#64748b' }}>Loading columns... (save and reload if empty)</p>
          )}

          <Field label="Rows per page">
            <input type="number" value={p.pageSize??20} onChange={e => up({pageSize:Number(e.target.value)})} style={INP} min={1} max={200} />
          </Field>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', color:'#cbd5e1', cursor:'pointer', fontSize:'12px' }}>
            <input type="checkbox" checked={p.stripeRows??true} onChange={e => up({stripeRows:e.target.checked})} />
            Stripe alternate rows
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', color:'#cbd5e1', cursor:'pointer', fontSize:'12px' }}>
            <input type="checkbox" checked={p.showSumRow??false} onChange={e => up({showSumRow:e.target.checked})} />
            Show totals row
          </label>
          {(p.sourceTable||p.formId) && (
            <div style={{ padding:'8px', backgroundColor:'#0f172a', borderRadius:'6px', border:'1px solid #334155' }}>
              <p style={{ margin:0, fontSize:'11px', color:'#6366f1', fontWeight:'600' }}>
                Source: {p.sourceTable ?? forms.find(f=>f.id===p.formId)?.name}
              </p>
            </div>
          )}
        </div>
      );
    }
    case 'section': {
      const p = block.props as SectionProps;
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', color:'#cbd5e1', cursor:'pointer', fontSize:'12px' }}>
            <input type="checkbox" checked={p.fullWidth??false} onChange={e => up({fullWidth:e.target.checked})} />
            Full width (edge-to-edge)
          </label>
          {!p.fullWidth && (
            <Field label="Max width"><input value={p.containerMaxWidth??'1200px'} onChange={e => up({containerMaxWidth:e.target.value})} style={INP} /></Field>
          )}
        </div>
      );
    }
    case 'container': {
      const p = block.props as ContainerProps;
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <Field label="Columns">
            <select value={p.columns??1} onChange={e => up({columns:Number(e.target.value)})} style={SEL}>
              {[1,2,3,4,6].map(n => <option key={n} value={n}>{n} col{n>1?'s':''}</option>)}
            </select>
          </Field>
          <Field label="Gap"><input value={p.columnGap??'16px'} onChange={e => up({columnGap:e.target.value})} style={INP} /></Field>
        </div>
      );
    }
    case 'divider': {
      const p = block.props as DividerProps;
      return (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <Field label="Style">
            <select value={p.style??'solid'} onChange={e => up({style:e.target.value})} style={SEL}>
              {['solid','dashed','dotted'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Thickness"><input value={p.thickness??'1px'} onChange={e => up({thickness:e.target.value})} style={INP} /></Field>
          <Field label="Color"><input type="color" value={p.color??'#e5e7eb'} onChange={e => up({color:e.target.value})} style={{...INP,height:'36px',padding:'2px'}} /></Field>
        </div>
      );
    }
    case 'spacer': {
      const p = block.props as SpacerProps;
      return <Field label="Height"><input value={p.height??'40px'} onChange={e => up({height:e.target.value})} style={INP} /></Field>;
    }
    default:
      return <p style={{ color:'#64748b', fontSize:'12px' }}>No settings for this block type.</p>;
  }
}

function StyleFields({ styles, us }: { styles:Partial<BlockStyles>; us:(s:Partial<BlockStyles>)=>void }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
      <Sec label="Spacing">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
          <Field label="Pad top"><input value={styles.paddingTop??''} onChange={e=>us({paddingTop:e.target.value})} style={INP} placeholder="0px" /></Field>
          <Field label="Pad bottom"><input value={styles.paddingBottom??''} onChange={e=>us({paddingBottom:e.target.value})} style={INP} placeholder="0px" /></Field>
          <Field label="Pad left"><input value={styles.paddingLeft??''} onChange={e=>us({paddingLeft:e.target.value})} style={INP} placeholder="0px" /></Field>
          <Field label="Pad right"><input value={styles.paddingRight??''} onChange={e=>us({paddingRight:e.target.value})} style={INP} placeholder="0px" /></Field>
          <Field label="Margin top"><input value={styles.marginTop??''} onChange={e=>us({marginTop:e.target.value})} style={INP} placeholder="0px" /></Field>
          <Field label="Margin bottom"><input value={styles.marginBottom??''} onChange={e=>us({marginBottom:e.target.value})} style={INP} placeholder="0px" /></Field>
        </div>
      </Sec>
      <Sec label="Size">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
          <Field label="Width"><input value={styles.width??''} onChange={e=>us({width:e.target.value})} style={INP} placeholder="100%" /></Field>
          <Field label="Max width"><input value={styles.maxWidth??''} onChange={e=>us({maxWidth:e.target.value})} style={INP} /></Field>
          <Field label="Height"><input value={styles.height??''} onChange={e=>us({height:e.target.value})} style={INP} placeholder="auto" /></Field>
          <Field label="Min height"><input value={styles.minHeight??''} onChange={e=>us({minHeight:e.target.value})} style={INP} /></Field>
        </div>
      </Sec>
      <Sec label="Typography">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
          <Field label="Font size"><input value={styles.fontSize??''} onChange={e=>us({fontSize:e.target.value})} style={INP} placeholder="16px" /></Field>
          <Field label="Weight">
            <select value={styles.fontWeight??''} onChange={e=>us({fontWeight:e.target.value})} style={SEL}>
              <option value="">--</option>
              {['300','400','500','600','700','800'].map(w=><option key={w} value={w}>{w}</option>)}
            </select>
          </Field>
          <Field label="Line height"><input value={styles.lineHeight??''} onChange={e=>us({lineHeight:e.target.value})} style={INP} /></Field>
          <Field label="Align">
            <select value={styles.textAlign??''} onChange={e=>us({textAlign:e.target.value})} style={SEL}>
              <option value="">--</option>
              {['left','center','right','justify'].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Color"><input type="color" value={styles.color??'#000000'} onChange={e=>us({color:e.target.value})} style={{...INP,height:'36px',padding:'2px'}} /></Field>
        </div>
      </Sec>
      <Sec label="Background">
        <Field label="Color"><input type="color" value={styles.backgroundColor??'#ffffff'} onChange={e=>us({backgroundColor:e.target.value})} style={{...INP,height:'36px',padding:'2px'}} /></Field>
        <div style={{ marginTop:'8px' }}>
          <Field label="Image URL"><input value={styles.backgroundImage??''} onChange={e=>us({backgroundImage:e.target.value})} style={INP} placeholder="url(...)" /></Field>
        </div>
      </Sec>
      <Sec label="Border">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
          <Field label="Radius"><input value={styles.borderRadius??''} onChange={e=>us({borderRadius:e.target.value})} style={INP} placeholder="0px" /></Field>
          <Field label="Width"><input value={styles.borderWidth??''} onChange={e=>us({borderWidth:e.target.value})} style={INP} placeholder="0px" /></Field>
          <Field label="Color"><input type="color" value={styles.borderColor??'#e5e7eb'} onChange={e=>us({borderColor:e.target.value})} style={{...INP,height:'36px',padding:'2px'}} /></Field>
          <Field label="Style">
            <select value={styles.borderStyle??''} onChange={e=>us({borderStyle:e.target.value})} style={SEL}>
              <option value="">--</option>
              {['solid','dashed','dotted'].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      </Sec>
      <Sec label="Shadow">
        <Field label="Box shadow"><input value={styles.boxShadow??''} onChange={e=>us({boxShadow:e.target.value})} style={INP} placeholder="0 1px 3px rgba(0,0,0,0.1)" /></Field>
      </Sec>
    </div>
  );
}

function Field({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</label>
      {children}
    </div>
  );
}

function Sec({ label, children }: { label:string; children:React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom:'1px solid #1e293b', paddingBottom:'10px' }}>
      <button onClick={() => setOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:'4px', border:'none', background:'none', cursor:'pointer', color:'#94a3b8', fontSize:'10px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.08em', padding:'0 0 6px', width:'100%' }}>
        <span style={{ display:'inline-block', transform:open?'rotate(90deg)':'none', transition:'transform 0.15s' }}>&#8250;</span>
        {label}
      </button>
      {open && children}
    </div>
  );
}

const INP: React.CSSProperties = { width:'100%', backgroundColor:'#0f172a', border:'1px solid #334155', borderRadius:'6px', color:'#e2e8f0', padding:'6px 8px', fontSize:'12px', boxSizing:'border-box' };
const SEL: React.CSSProperties = { ...INP };
const TA: React.CSSProperties = { ...INP, resize:'vertical' };
