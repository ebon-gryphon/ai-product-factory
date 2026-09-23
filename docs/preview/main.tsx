import React, { useState } from 'react';
import brandIcon from '../../AionUi/resources/app.png';
import { createRoot } from 'react-dom/client';
import { Button, Input } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import FactoryLaunchpad from '../../AionUi/packages/desktop/src/renderer/pages/guid/components/FactoryLaunchpad';
import styles from '../../AionUi/packages/desktop/src/renderer/pages/guid/index.module.css';
import guid from '../../AionUi/packages/desktop/src/renderer/services/i18n/locales/zh-CN/guid.json';

await i18n.use(initReactI18next).init({ lng: 'zh-CN', resources: { 'zh-CN': { translation: { guid } } }, interpolation: { escapeValue: false } });

function Preview() {
  const [draft, setDraft] = useState('');
  return <div style={{minHeight:'100vh',background:'var(--color-fill-1)',color:'var(--color-text-1)',fontFamily:'system-ui,sans-serif'}}>
    <nav style={{padding:'20px 32px',borderBottom:'1px solid var(--color-border-2)',display:'flex',alignItems:'center',gap:12}}>
      <img src={brandIcon} width='36' height='36' alt='' />
      <strong>AI产品加工厂</strong><span style={{marginLeft:'auto',color:'var(--color-text-3)'}}>首页交互预览 · AI 服务未连接</span>
    </nav>
    <main style={{maxWidth:900,margin:'0 auto',padding:'64px 24px'}}>
      <header className={styles.factoryHeader}><span className={styles.factoryEyebrow}>{guid.factory.eyebrow}</span><h1>{guid.factory.title}</h1><p>{guid.factory.subtitle}</p></header>
      <FactoryLaunchpad disabled={false} onSelect={prompt=>setDraft(value=>value?`${value}\n${prompt}`:prompt)}/>
      <section style={{padding:24,borderRadius:20,background:'var(--color-bg-2)',border:'1px solid var(--color-border-2)'}}>
        <label htmlFor='preview-draft' style={{display:'block',marginBottom:12,fontWeight:600}}>任务草稿</label>
        <Input.TextArea id='preview-draft' value={draft} onChange={setDraft} autoSize={{minRows:7,maxRows:14}} placeholder='描述你想完成的工作，或选择上方工序…'/>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:16}}><span style={{color:'var(--color-text-3)',fontSize:12}}>正式应用支持选择助手、模型和本地项目资料。</span><Button onClick={()=>setDraft('')}>清空草稿</Button></div>
      </section>
      <p style={{color:'var(--color-text-3)',fontSize:12,marginTop:24}}>此预览复用正式应用的工序组件，用于体验任务选择和草稿编辑。执行 AI 任务请启动桌面应用并配置模型。</p>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
