(function () {
'use strict';

const MP_API_RE = /api\.csrestored\.fun\/.*(marketplace|\/offers)/i;
const MP_API_URL = 'https://api.csrestored.fun/inventory/marketplace/';
const TRADE_API_RE = /api\.csrestored\.fun\/(?:api\/)?trades\b/i;

const RARITY = {
    0: { name:'Contraband',       hex:'#facc15' },
    1: { name:'Covert',           hex:'#ef4444' },
    2: { name:'Classified',       hex:'#e879f9' },
    3: { name:'Restricted',       hex:'#a855f7' },
    4: { name:'Mil-Spec',         hex:'#60a5fa' },
    5: { name:'Industrial Grade', hex:'#7dd3fc' },
    6: { name:'Consumer Grade',   hex:'#a8a29e' },
};

function getCondition(f) {
    if (f == null) return '';
    if (f < 0.07)  return 'FN';
    if (f < 0.15)  return 'MW';
    if (f < 0.38)  return 'FT';
    if (f < 0.45)  return 'WW';
    return 'BS';
}
function wearColor(f) {
    if (f == null) return '#94a3b8';
    if (f < 0.07)  return '#4ade80';
    if (f < 0.15)  return '#86efac';
    if (f < 0.38)  return '#fbbf24';
    if (f < 0.45)  return '#fb923c';
    return '#f87171';
}
function wName(i) { return i.name.split(' | ')[0] ?? i.name; }
function sName(i) {
    const s = i.name.split(' | ')[1];
    if (!s && parseInt(i.item_type) === 1) return 'Vanilla';
    return s ?? '';
}

const S = document.createElement('style');
S.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

.csrx-card-wrap {
    position: absolute !important;
    bottom: 6px !important;
    right: 6px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-end !important;
    gap: 2px !important;
    pointer-events: none !important;
    z-index: 10 !important;
}
/* Marketplace: abaixo do preço (coins), canto superior direito */
.csrx-card-wrap.csrx-mp-pos {
    bottom: auto !important;
    top: 32px !important;
    right: 8px !important;
}
.csrx-float-badge {
    display: inline-flex !important;
    align-items: center !important;
    gap: 3px !important;
    padding: 2px 6px !important;
    border-radius: 3px !important;
    font-family: 'Inter', monospace !important;
    font-size: 9px !important;
    font-weight: 600 !important;
    white-space: nowrap !important;
    letter-spacing: 0.1px !important;
    background: rgba(0,0,0,0.78) !important;
    border: 1px solid rgba(255,255,255,0.08) !important;
    backdrop-filter: blur(6px) !important;
}
.csrx-float-dot {
    width: 4px !important;
    height: 4px !important;
    border-radius: 50% !important;
    flex-shrink: 0 !important;
    display: inline-block !important;
}
.csrx-seed-badge {
    font-family: 'Inter', sans-serif !important;
    font-size: 9px !important;
    font-weight: 500 !important;
    color: rgba(255,255,255,0.45) !important;
    background: rgba(0,0,0,0.65) !important;
    padding: 2px 5px !important;
    border-radius: 3px !important;
    backdrop-filter: blur(6px) !important;
    white-space: nowrap !important;
    letter-spacing: 0.1px !important;
}

@keyframes csrxPulse {
    0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
    70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
}
.csrx-picked {
    outline: 1.5px solid rgba(239,68,68,0.8) !important;
    outline-offset: 2px !important;
    transform: scale(0.94) !important;
    border-radius: 14px !important;
    animation: csrxPulse 2s infinite !important;
    position: relative !important;
    transition: transform 0.15s !important;
}
.csrx-check-badge {
    position: absolute !important;
    top: 6px !important;
    left: 6px !important;
    width: 18px !important;
    height: 18px !important;
    background: #ef4444 !important;
    border-radius: 4px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 20 !important;
    pointer-events: none !important;
}

#csrx-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 48px;
    height: 48px;
    background: #ef4444;
    border-radius: 12px;
    display: none;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2147483640;
    box-shadow: 0 4px 20px rgba(239,68,68,0.35);
    transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
    border: none;
}
#csrx-fab:hover {
    transform: scale(1.07) translateY(-2px);
    box-shadow: 0 8px 28px rgba(239,68,68,0.5);
}

#csrx-win {
    position: fixed;
    top: 72px;
    right: 18px;
    width: 268px;
    background: #0a0a0a;
    border: 1px solid #1f1f1f;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03);
    z-index: 2147483640;
    display: none;
    flex-direction: column;
    overflow: hidden;
    font-family: 'Inter', sans-serif;
}
#csrx-win-top {
    height: 1px;
    background: linear-gradient(90deg, transparent, #ef4444, transparent);
    opacity: 0.6;
    flex-shrink: 0;
}

#csrx-hdr {
    padding: 14px 16px 13px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: grab;
    user-select: none;
    border-bottom: 1px solid #161616;
}
#csrx-hdr:active { cursor: grabbing; }

.csrx-logo {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    flex-shrink: 0;
    background: #ef4444;
    display: flex;
    align-items: center;
    justify-content: center;
}
.csrx-hdr-text { flex: 1; min-width: 0; }
.csrx-hdr-title {
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.2px;
    line-height: 1;
}
.csrx-hdr-sub {
    font-size: 10px;
    color: #3d3d3d;
    margin-top: 2px;
    font-weight: 400;
}

#csrx-winx {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    flex-shrink: 0;
    background: transparent;
    border: 1px solid #1f1f1f;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
}
#csrx-winx:hover { background: #1a1a1a; border-color: #2a2a2a; }

#csrx-statusbar {
    margin: 10px 12px 0;
    padding: 7px 11px;
    background: #111;
    border: 1px solid #1a1a1a;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 7px;
}
.csrx-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #22c55e;
}
.csrx-dot.syncing { background: #f59e0b; animation: csrxBlink 0.9s infinite; }
.csrx-dot.active  { background: #ef4444; }
@keyframes csrxBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }
#csrx-stat { font-size: 10px; font-weight: 500; color: #3d3d3d; flex: 1; }

#csrx-body { padding: 12px; display: flex; flex-direction: column; gap: 14px; }

.csrx-section {
    font-size: 9px;
    font-weight: 600;
    color: #2a2a2a;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
}
.csrx-section::after { content: ''; flex: 1; height: 1px; background: #1a1a1a; }

.csrx-btn {
    width: 100%;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
    font-family: 'Inter', sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}
.csrx-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none !important; }

.csrx-btn-primary {
    background: #ef4444;
    color: #fff;
    border-color: #ef4444;
    box-shadow: 0 2px 12px rgba(239,68,68,0.25);
}
.csrx-btn-primary:hover:not(:disabled) {
    background: #dc2626;
    border-color: #dc2626;
    box-shadow: 0 4px 18px rgba(239,68,68,0.38);
    transform: translateY(-1px);
}
.csrx-btn-success {
    background: transparent;
    color: #fff;
    border-color: #2a2a2a;
}
.csrx-btn-success:hover:not(:disabled) {
    background: #1a1a1a;
    border-color: #333;
    transform: translateY(-1px);
}
.csrx-btn-danger {
    background: transparent;
    color: #ef4444;
    border-color: #2a2a2a;
}
.csrx-btn-danger:hover:not(:disabled) {
    background: rgba(239,68,68,0.06);
    border-color: rgba(239,68,68,0.3);
    transform: translateY(-1px);
}
.csrx-btn-cancel {
    background: transparent;
    color: #555;
    border-color: #1f1f1f;
}
.csrx-btn-cancel:hover:not(:disabled) { background: #111; color: #888; }

#csrx-picked-info {
    display: none;
    background: rgba(239,68,68,0.06);
    border: 1px solid rgba(239,68,68,0.15);
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 10px;
    color: #ef4444;
    font-weight: 500;
    align-items: center;
    gap: 5px;
}
#csrx-picked-info.show { display: flex; }

select.csrx-sel {
    width: 100%;
    padding: 9px 26px 9px 11px;
    background: #111;
    border: 1px solid #1f1f1f;
    border-radius: 8px;
    color: #666;
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 500;
    outline: none;
    cursor: pointer;
    appearance: none;
    transition: all 0.15s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' fill='%23333' viewBox='0 0 16 16'%3E%3Cpath d='M4 6h8l-4 5z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 9px center;
}
select.csrx-sel:focus { border-color: #2a2a2a; color: #aaa; outline: none; }
select.csrx-sel option { background: #0a0a0a; color: #aaa; }

.csrx-slider-wrap { padding: 1px 0; }
.csrx-slider-row  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; }
.csrx-slider-lbl  { font-size: 10px; font-weight: 500; color: #333; }
.csrx-slider-val  {
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: #161616;
    border: 1px solid #222;
    padding: 1px 8px;
    border-radius: 4px;
    min-width: 24px;
    text-align: center;
}
input[type=range].csrx-range {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    background: transparent;
}
input[type=range].csrx-range::-webkit-slider-runnable-track,
input[type=range].csrx-range::-moz-range-track {
    height: 2px;
    background: #1f1f1f;
    border-radius: 2px;
}
input[type=range].csrx-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 12px;
    width: 12px;
    border-radius: 50%;
    background: #ef4444;
    cursor: pointer;
    margin-top: -5px;
    box-shadow: 0 0 8px rgba(239,68,68,0.4);
    transition: transform 0.15s;
}
input[type=range].csrx-range::-moz-range-thumb {
    height: 12px;
    width: 12px;
    border: none;
    border-radius: 50%;
    background: #ef4444;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(239,68,68,0.4);
    transition: transform 0.15s;
}
input[type=range].csrx-range:hover::-webkit-slider-thumb,
input[type=range].csrx-range:hover::-moz-range-thumb { transform: scale(1.2); }

#csrx-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.92);
    backdrop-filter: blur(16px);
    z-index: 2147483647;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
}
#csrx-overlay.open { display: flex; }

#csrx-modal {
    background: #0a0a0a;
    border: 1px solid #1f1f1f;
    border-radius: 18px;
    width: 100%;
    max-width: 860px;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 40px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.02);
    font-family: 'Inter', sans-serif;
    animation: csrxIn 0.22s cubic-bezier(0.34,1.56,0.64,1);
}
@keyframes csrxIn {
    from { opacity:0; transform:scale(0.94) translateY(20px); }
    to   { opacity:1; transform:scale(1) translateY(0); }
}
#csrx-modal-top {
    height: 1px;
    flex-shrink: 0;
    background: linear-gradient(90deg, transparent, #ef4444 30%, #ef4444 70%, transparent);
    opacity: 0.5;
}

#csrx-mhdr {
    padding: 18px 22px 15px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 1px solid #161616;
    flex-shrink: 0;
}
.csrx-mhdr-left { display: flex; flex-direction: column; gap: 4px; }
.csrx-mhdr-title {
    font-size: 17px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.3px;
    line-height: 1;
}
.csrx-mhdr-title span { color: #ef4444; }
.csrx-mhdr-sub { font-size: 11px; color: #333; font-weight: 400; }

#csrx-mxbtn {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    flex-shrink: 0;
    background: transparent;
    border: 1px solid #1f1f1f;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
}
#csrx-mxbtn:hover { background: #161616; border-color: #2a2a2a; }

#csrx-mprog { height: 1px; background: #161616; flex-shrink: 0; overflow: hidden; }
#csrx-mbar  {
    height: 100%;
    width: 0;
    background: #ef4444;
    transition: width 0.4s;
    box-shadow: 0 0 8px rgba(239,68,68,0.6);
}

#csrx-mwarn {
    margin: 12px 22px 0;
    padding: 10px 14px;
    background: rgba(239,68,68,0.04);
    border: 1px solid rgba(239,68,68,0.12);
    border-radius: 8px;
    font-size: 11px;
    color: #ef4444;
    font-weight: 400;
    display: none;
    flex-shrink: 0;
    align-items: flex-start;
    gap: 9px;
    line-height: 1.5;
}
#csrx-mwarn.show { display: flex; }

#csrx-validator {
    margin: 12px 22px 0;
    padding: 12px 14px;
    background: #111;
    border: 1px solid #1a1a1a;
    border-radius: 10px;
    flex-shrink: 0;
    display: none;
}
#csrx-validator.show { display: block; }
.csrx-val-title {
    font-size: 9px;
    font-weight: 600;
    color: #2a2a2a;
    text-transform: uppercase;
    letter-spacing: 1.3px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 5px;
}
.csrx-val-grid { display: flex; flex-direction: column; gap: 3px; }
.csrx-val-row  {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    padding: 6px 8px;
    border-radius: 6px;
    background: #0d0d0d;
}
.csrx-val-icon   { width: 13px; height: 13px; flex-shrink: 0; }
.csrx-val-name   { color: #666; font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.csrx-val-status { font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
.vsok  { background: rgba(34,197,94,0.08);  color: #22c55e; border: 1px solid rgba(34,197,94,0.15); }
.vswarn{ background: rgba(245,158,11,0.08); color: #f59e0b; border: 1px solid rgba(245,158,11,0.15); }
.vserr { background: rgba(239,68,68,0.08);  color: #ef4444; border: 1px solid rgba(239,68,68,0.15); }

#csrx-mgrid {
    flex: 1;
    overflow-y: auto;
    padding: 16px 22px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-content: flex-start;
}
#csrx-mgrid::-webkit-scrollbar { width: 3px; }
#csrx-mgrid::-webkit-scrollbar-track { background: transparent; }
#csrx-mgrid::-webkit-scrollbar-thumb { background: #1f1f1f; border-radius: 3px; }

.mc {
    width: 148px;
    flex-shrink: 0;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
    background: #111;
    border: 1px solid #1a1a1a;
    transition: all 0.18s;
}
.mc:hover {
    transform: translateY(-3px);
    border-color: #2a2a2a;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.mc.mc-bad {
    border-color: rgba(239,68,68,0.2) !important;
    background: #0f0808 !important;
}
.mc.mc-confirmed { border-color: #1f1f1f; }

.mc-rline { height: 1.5px; width: 100%; flex-shrink: 0; }

.mc-verified {
    position: absolute;
    top: 7px;
    right: 7px;
    z-index: 5;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: #22c55e;
    display: flex;
    align-items: center;
    justify-content: center;
}

.mc-img {
    width: 100%;
    height: 94px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
}
.mc-img img {
    max-width: 110px;
    max-height: 76px;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgba(0,0,0,0.8));
    display: block;
    position: relative;
    z-index: 1;
    transition: transform 0.18s;
}
.mc:hover .mc-img img { transform: scale(1.06) translateY(-2px); }
.mc-img-ph { font-size: 32px; z-index: 1; position: relative; }

.mc-wear {
    position: absolute;
    top: 7px;
    left: 7px;
    z-index: 3;
    font-family: 'Inter', sans-serif;
    font-size: 9px;
    font-weight: 600;
    padding: 2px 5px;
    border-radius: 3px;
    background: rgba(0,0,0,0.82);
    border: 1px solid rgba(255,255,255,0.06);
}

.mc-rm {
    position: absolute;
    bottom: 7px;
    right: 7px;
    z-index: 10;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: rgba(0,0,0,0.8);
    border: 1px solid rgba(239,68,68,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
    opacity: 0.5;
}
.mc-rm:hover { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.4); opacity: 1; }

.mc-body { padding: 0 9px 9px; display: flex; flex-direction: column; flex: 1; }

.mc-weapon {
    font-size: 9px;
    font-weight: 500;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1.8;
}
.mc-skin {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 6px;
    color: #fff;
}

.mc-float-row {
    display: flex;
    align-items: stretch;
    border-radius: 5px;
    overflow: hidden;
    border: 1px solid #1a1a1a;
    background: #0d0d0d;
    flex-shrink: 0;
}
.mc-float-cond {
    font-size: 9px;
    font-weight: 700;
    padding: 3px 6px;
    flex-shrink: 0;
    border-right: 1px solid #1a1a1a;
    display: flex;
    align-items: center;
}
.mc-float-num {
    font-size: 9px;
    font-weight: 400;
    color: #444;
    padding: 3px 6px;
    flex: 1;
    font-family: 'Inter', monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    display: flex;
    align-items: center;
}

.mc-pattern-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 3px;
}
.mc-pattern-lbl { font-size: 9px; font-weight: 400; color: #2a2a2a; }
.mc-pattern-num { font-size: 9px; font-weight: 600; color: #444; font-family: 'Inter', monospace; }

.mc-divider { height: 1px; background: #161616; margin: 5px 0; flex-shrink: 0; }
.mc-rarity  { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.mc-id      { font-size: 9px; color: #222; font-family: 'Inter', monospace; line-height: 1.5; }
.mc-st      { font-size: 10px; font-weight: 600; color: #f59e0b; margin-top: 2px; }
.mc-tag     { font-size: 10px; font-weight: 400; color: #666; font-style: italic; margin-top: 1px; }
.mc-statusbar { height: 1.5px; border-radius: 2px; margin-top: 5px; flex-shrink: 0; }

#csrx-mfoot {
    padding: 13px 22px;
    border-top: 1px solid #161616;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-shrink: 0;
    background: #080808;
}
#csrx-msumm { flex: 1; }
.csrx-summ-count {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.5px;
    line-height: 1;
}
.csrx-summ-sub { font-size: 10px; color: #2a2a2a; margin-top: 2px; font-weight: 400; }

.m-btn {
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1px;
    cursor: pointer;
    border: 1px solid transparent;
    font-family: 'Inter', sans-serif;
    transition: all 0.15s;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
}
.m-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none !important; }

#csrx-mcancel {
    background: transparent;
    color: #444;
    border-color: #1f1f1f;
}
#csrx-mcancel:hover:not(:disabled) { background: #111; color: #666; }

#csrx-msell {
    background: #ef4444;
    color: #fff;
    border-color: #ef4444;
    box-shadow: 0 2px 14px rgba(239,68,68,0.3);
    min-width: 136px;
    justify-content: center;
}
#csrx-msell:hover:not(:disabled) {
    background: #dc2626;
    border-color: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(239,68,68,0.45);
}

#csrx-toast {
    position: fixed;
    bottom: 22px;
    left: 50%;
    transform: translateX(-50%) translateY(14px);
    z-index: 2147483647;
    background: #111;
    border: 1px solid #1f1f1f;
    border-radius: 9px;
    padding: 9px 15px;
    font-size: 12px;
    font-weight: 500;
    color: #fff;
    font-family: 'Inter', sans-serif;
    min-width: 170px;
    box-shadow: 0 12px 36px rgba(0,0,0,0.6);
    transition: all 0.26s cubic-bezier(0.34,1.56,0.64,1);
    opacity: 0;
    pointer-events: none;
    text-align: center;
    display: flex;
    align-items: center;
    gap: 9px;
    white-space: nowrap;
}
#csrx-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.csrx-toast-icon {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

#csrx-browse {
    width: 100%;
    margin: 12px 0 16px 0;
    padding: 0;
    font-family: 'Inter', sans-serif;
    z-index: 50;
    position: relative;
    box-sizing: border-box;
}
.csrx-browse-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    width: 100%;
}
#csrx-browse-search {
    flex: 1 1 220px;
    min-width: 180px;
    max-width: 420px;
    height: 36px;
    padding: 0 12px 0 36px;
    border-radius: 8px;
    border: 1px solid #2a2a2a;
    background: #111 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='%23666' stroke-width='2'%3E%3Ccircle cx='6' cy='6' r='4'/%3E%3Cpath d='M9 9l3 3'/%3E%3C/svg%3E") 12px center no-repeat;
    color: #fff;
    font-size: 13px;
    outline: none;
}
#csrx-browse-search:focus { border-color: #ef4444; }
#csrx-browse-search::placeholder { color: #555; }
.csrx-browse-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-left: auto;
}
.csrx-browse-filters select {
    height: 36px;
    padding: 0 28px 0 10px;
    border-radius: 8px;
    border: 1px solid #2a2a2a;
    background: #111;
    color: #ddd;
    font-size: 12px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='%23666'%3E%3Cpath d='M0 0l5 6 5-6z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
}
.csrx-browse-filters select:focus { border-color: #ef4444; }
#csrx-browse-clear {
    height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid #2a2a2a;
    background: transparent;
    color: #888;
    font-size: 12px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
}
#csrx-browse-clear:hover { color: #fff; border-color: #444; }
#csrx-browse-count {
    margin-top: 8px;
    font-size: 11px;
    color: #666;
}
.csrx-browse-hidden { display: none !important; }
`;
document.head.appendChild(S);

let inventoryCache   = [];
let marketplaceCache = [];
let tradeItemsCache      = [];
let tradesListCache      = [];
let friendInventoryCache = [];
let overlayRunning       = false;
let overlayTimer     = null;
let overlayPageKind  = null;
let browsePageKind   = null;

function isMarketplacePage() {
    return window.location.pathname.includes('/marketplace');
}
function isTradePage() {
    const p = window.location.pathname;
    return p.includes('/trade-up') || p.includes('/play') || /\/trades(\/|$)/i.test(p);
}
function isTradePickerModal() {
    for (const el of document.querySelectorAll('h1, h2, h3, p, span, div')) {
        const t = el.textContent?.trim() || '';
        if (/^send trade offer$/i.test(t)) return true;
    }
    return false;
}
function isTradeDetailView() {
    if (isTradePickerModal()) return false;
    const body = document.body?.innerText || '';
    return body.includes('Your offer') && body.includes('Their offer');
}
function isTheirItemsTabActive() {
    const tabs = [...document.querySelectorAll('button, p, span, div, a')];
    let myTab = null;
    let theirTab = null;
    for (const el of tabs) {
        const t = el.textContent?.trim() || '';
        if (/^my items$/i.test(t)) myTab = el;
        if (/^their items$/i.test(t)) theirTab = el;
    }
    if (myTab && theirTab) {
        const myBorder = parseFloat(getComputedStyle(myTab).borderBottomWidth) || 0;
        const theirBorder = parseFloat(getComputedStyle(theirTab).borderBottomWidth) || 0;
        if (theirBorder > myBorder) return true;
        if (theirTab.className?.includes?.('text-theme-primary')) return true;
        if (myTab.className?.includes?.('text-theme-primary')) return false;
    }
    return false;
}
function isInventoryPage() {
    const p = window.location.pathname.replace(/\/$/, '');
    return p === '/app/inventory';
}
function isOverlayPage() {
    return isInventoryPage() || isMarketplacePage() || isTradePage()
        || isTradePickerModal() || isTradeDetailView();
}

function normalizeInventoryEntry(i) {
    if (!i) return null;
    return {
        offer_id:  null,
        weapon_id: i.weapon_id != null ? parseInt(i.weapon_id, 10) : null,
        item_id:   i.item_id != null ? parseInt(i.item_id, 10) : null,
        float:     i.float != null && !Number.isNaN(parseFloat(i.float)) ? parseFloat(i.float) : null,
        seed:      i.seed != null ? parseInt(i.seed, 10) : null,
        stattrak:  !!i.stattrak,
        stattrak_count: i.stattrak_count != null ? parseInt(i.stattrak_count, 10) : null,
        rarity:    i.rarity,
        name:      i.name,
    };
}

function mergeItemCache(existing, incoming) {
    const map = new Map();
    for (const o of existing) {
        const k = o.weapon_id ?? `o${o.offer_id}` ?? `${o.item_id}-${o.float}-${o.seed}`;
        map.set(k, o);
    }
    for (const o of incoming) {
        const k = o.weapon_id ?? `o${o.offer_id}` ?? `${o.item_id}-${o.float}-${o.seed}`;
        map.set(k, o);
    }
    return [...map.values()];
}

function extractTradeItems(data, depth = 0) {
    if (!data || depth > 10) return [];
    const out = [];
    const visit = (node, d) => {
        if (!node || d > 10) return;
        if (Array.isArray(node)) {
            node.forEach(x => visit(x, d + 1));
            return;
        }
        if (typeof node !== 'object') return;
        const itemId = node.item_id ?? node.skin_id;
        const fl = node.skin_float ?? node.float ?? node.wear;
        if (itemId != null && (fl != null || node.weapon_id != null)) {
            const n = normalizeOfferEntry(node);
            if (n) out.push(n);
        }
        for (const v of Object.values(node)) {
            if (v && typeof v === 'object') visit(v, d + 1);
        }
    };
    visit(data, depth);
    return out;
}

function looksLikeTradePayload(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.all || data.sent || data.received || data.history) return true;
    if (data.items_from_initiator || data.items_from_recipient) return true;
    if (data.id != null && (data.items_from_initiator || data.items_from_recipient)) return true;
    return false;
}

function collectTradesFromData(data) {
    const trades = [];
    const addTrade = (trade, viewerRole) => {
        if (!trade || typeof trade !== 'object') return;
        if (!trade.items_from_initiator && !trade.items_from_recipient) return;
        const t = viewerRole ? { ...trade, _viewerRole: viewerRole } : trade;
        trades.push(t);
    };
    if (Array.isArray(data)) {
        data.forEach(t => addTrade(t));
    } else if (data.all || data.sent || data.received || data.history) {
        for (const key of ['all', 'sent', 'received', 'history']) {
            if (!Array.isArray(data[key])) continue;
            const role = key === 'received' ? 'recipient' : key === 'sent' ? 'initiator' : null;
            data[key].forEach(t => addTrade(t, role));
        }
    } else {
        addTrade(data);
    }
    return trades;
}

function getItemsFromTrade(trade) {
    const items = [];
    if (!trade) return items;
    for (const key of ['items_from_initiator', 'items_from_recipient', 'initiator_items', 'recipient_items']) {
        const arr = trade[key];
        if (!Array.isArray(arr)) continue;
        for (const it of arr) {
            const n = normalizeOfferEntry(it);
            if (n) items.push(n);
        }
    }
    if (!items.length) return extractTradeItems(trade);
    return items;
}

function parseTradesResponse(data) {
    const trades = collectTradesFromData(data);
    if (trades.length) {
        const byId = new Map(tradesListCache.map(t => [t.id, t]));
        for (const t of trades) {
            const prev = byId.get(t.id);
            if (prev && !t._viewerRole && prev._viewerRole) byId.set(t.id, { ...t, _viewerRole: prev._viewerRole });
            else byId.set(t.id, t);
        }
        tradesListCache = [...byId.values()];
    }
    const items = [];
    for (const trade of trades) items.push(...getItemsFromTrade(trade));
    if (items.length) tradeItemsCache = mergeItemCache(tradeItemsCache, items);
    return items;
}

function cardMatchesItem(card, item) {
    const imgId = getImgItemId(card);
    const hasSt = cardHasStatTrak(card);
    if (imgId != null && imgId === item.item_id && item.stattrak === hasSt) return true;
    const names = getCardSkinNames(card);
    if (names && itemMatchesNames(item, names.weapon, names.skin, hasSt)) return true;
    return false;
}

function getCurrentTrade() {
    const cards = getAllCards();
    if (tradesListCache.length && cards.length) {
        let best = null;
        let bestScore = 0;
        for (const trade of tradesListCache) {
            const items = getItemsFromTrade(trade);
            if (!items.length) continue;
            let score = 0;
            for (const card of cards) {
                if (items.some(it => cardMatchesItem(card, it))) score++;
            }
            if (score > bestScore) { bestScore = score; best = trade; }
        }
        if (best && bestScore > 0) return best;
    }
    const tradeId = getTradeIdFromUrl();
    if (tradeId != null) {
        const trade = tradesListCache.find(t => t.id == tradeId);
        if (trade) return trade;
    }
    return tradesListCache[0] || null;
}

function getTradeSideItems(trade, side) {
    if (!trade) return [];
    const init = (trade.items_from_initiator || trade.initiator_items || [])
        .map(normalizeOfferEntry).filter(Boolean);
    const recip = (trade.items_from_recipient || trade.recipient_items || [])
        .map(normalizeOfferEntry).filter(Boolean);
    const role = trade._viewerRole;
    if (role === 'initiator') return side === 'your' ? init : recip;
    if (role === 'recipient') return side === 'your' ? recip : init;
    return side === 'your' ? init : recip;
}

function getActiveTradeItems() {
    const trade = getCurrentTrade();
    if (trade) return getItemsFromTrade(trade);
    if (tradeItemsCache.length) return tradeItemsCache;
    return [];
}

function getTradeIdFromUrl() {
    const m = window.location.pathname.match(/trade-up\/(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
}

function getPickerCache() {
    if (isTheirItemsTabActive()) return friendInventoryCache;
    return inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
}

function getOverlayCache() {
    if (isMarketplacePage()) return marketplaceCache;
    if (isTradePickerModal()) return getPickerCache();
    if (isTradeDetailView()) {
        const active = getActiveTradeItems();
        if (active.length) return active;
        return tradeItemsCache;
    }
    if (isTradePage()) return tradeItemsCache;
    return inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
}

function normalizeOfferEntry(o) {
    if (!o || typeof o !== 'object') return null;
    const item = o.item || o.weapon || o.skin || o;
    const offerId = o.id ?? o.offer_id ?? o.listing_id ?? item?.offer_id;
    const itemId  = o.item_id ?? item?.item_id ?? o.skin_id ?? item?.skin_id;
    const weaponId = o.weapon_id ?? item?.weapon_id;
    const fl = o.skin_float ?? item?.skin_float
        ?? o.float ?? item?.float
        ?? o.wear ?? item?.wear;
    const seed = o.skin_seed ?? item?.skin_seed
        ?? o.seed ?? item?.seed
        ?? o.paint_seed ?? item?.paint_seed;
    if (itemId == null && fl == null && offerId == null) return null;
    return {
        offer_id:  offerId != null ? parseInt(offerId, 10) : null,
        weapon_id: weaponId != null ? parseInt(weaponId, 10) : null,
        item_id:   itemId != null ? parseInt(itemId, 10) : null,
        float:     fl != null && !Number.isNaN(parseFloat(fl)) ? parseFloat(fl) : null,
        seed:      seed != null ? parseInt(seed, 10) : null,
        stattrak:  !!(o.stat_trak ?? item?.stat_trak ?? o.stattrak ?? item?.stattrak),
        stattrak_count: o.stattrak_count ?? item?.stattrak_count ?? null,
        rarity:    o.item_rarity ?? o.rarity ?? item?.rarity,
        name:      o.item_name ?? o.name ?? item?.name,
        price:     o.price != null ? parseInt(String(o.price).replace(/[^\d]/g, ''), 10)
            : (o.coins != null ? parseInt(String(o.coins).replace(/[^\d]/g, ''), 10) : null),
    };
}

function normalizeOfferList(data) {
    if (!data) return [];
    const arr = Array.isArray(data)
        ? data
        : (data.offers || data.listings || data.items || data.results || data.data || []);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeOfferEntry).filter(Boolean);
}

function looksLikeMarketplacePayload(data) {
    if (!data) return false;
    const raw = Array.isArray(data) ? data[0] : (data.offers?.[0] || data.items?.[0] || data.data?.[0]);
    if (raw && (raw.skin_float != null || raw.price != null)) return true;
    const items = normalizeOfferList(data);
    return items.some(i => i.float != null || i.offer_id != null);
}

function mergeMarketplaceCache(existing, incoming) {
    return mergeItemCache(existing, incoming);
}

function ingestApiPayload(url, data) {
    if (!data || typeof data !== 'object') return;
    if (MP_API_RE.test(url) || /\/inventory\/marketplace/i.test(url) || looksLikeMarketplacePayload(data)) {
        const items = normalizeOfferList(data);
        if (items.length) {
            marketplaceCache = mergeMarketplaceCache(marketplaceCache, items);
            if (isBrowsePage()) scheduleBrowseInit();
            if (browseToolsActive) scheduleBrowseFilters();
        }
        return;
    }
    if (TRADE_API_RE.test(url) || (looksLikeTradePayload(data) && !Array.isArray(data))) {
        parseTradesResponse(data);
        if ((isTradePage() || isTradeDetailView()) && overlayRunning) scheduleApplyOverlays();
        return;
    }
    if (/\/users\/[^/]+\/inventory/i.test(url)) {
        const arr = Array.isArray(data) ? data : (data.items || data.inventory || data.data || []);
        if (Array.isArray(arr) && arr.length) {
            friendInventoryCache = arr.map(normalizeInventoryEntry).filter(Boolean);
            if (overlayRunning) scheduleApplyOverlays();
        }
        return;
    }
    if (/\/inventory\/?(?:\?|$)/i.test(url) && !/\/inventory\/marketplace/i.test(url) && !/\/users\//i.test(url)) {
        const arr = Array.isArray(data) ? data : (data.items || data.inventory || data.data || []);
        if (Array.isArray(arr) && arr.length) {
            inventoryCache = arr.sort((a, b) => parseInt(a.rarity) - parseInt(b.rarity));
            if (overlayRunning) scheduleApplyOverlays();
            if (isBrowsePage()) scheduleBrowseInit();
            if (browseToolsActive) scheduleBrowseFilters();
        }
    }
}

let _applyOverlayTimer = null;
let _applyingOverlays   = false;
function scheduleApplyOverlays() {
    clearTimeout(_applyOverlayTimer);
    _applyOverlayTimer = setTimeout(() => {
        if (!overlayRunning || _applyingOverlays) return;
        _applyingOverlays = true;
        try { applyOverlaysToAll(); } finally { _applyingOverlays = false; }
    }, 500);
}

function clearSkinOverlays() {
    document.querySelectorAll('.csrx-card-wrap').forEach(w => {
        if (!w.closest('#csrx-win, #csrx-overlay, #csrx-fab, #csrx-toast')) w.remove();
    });
}

const _nativeFetch = window.fetch.bind(window);
window.fetch = async function (...args) {
    const res = await _nativeFetch(...args);
    try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        if (url.includes('api.csrestored.fun')) {
            const data = await res.clone().json();
            ingestApiPayload(url, data);
        }
    } catch (_) {}
    return res;
};

(function hookXHR() {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._csrxUrl = String(url || '');
        return open.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('load', function () {
            try {
                if (!this._csrxUrl?.includes('api.csrestored.fun')) return;
                ingestApiPayload(this._csrxUrl, JSON.parse(this.responseText));
            } catch (_) {}
        });
        return send.apply(this, args);
    };
})();

async function fetchInventory() {
    try {
        const r = await fetch('https://api.csrestored.fun/inventory/', { credentials: 'include' });
        if (!r.ok) throw r.status;
        const d = await r.json();
        const arr = Array.isArray(d) ? d : (d.items || d.inventory || d.data || []);
        return arr.sort((a, b) => parseInt(a.rarity) - parseInt(b.rarity));
    } catch(e) { return []; }
}

async function fetchMarketplace() {
    try {
        const r = await fetch(MP_API_URL, { credentials: 'include' });
        if (!r.ok) return marketplaceCache;
        const d = await r.json();
        const items = normalizeOfferList(d);
        if (items.length) marketplaceCache = items;
    } catch (_) {}
    return marketplaceCache;
}

function findOfferSectionRoot(which) {
    const want = which === 'your' ? 'your offer' : 'their offer';
    for (const el of document.querySelectorAll('p, span, div, h3, h4')) {
        const t = (el.textContent || '').trim().toLowerCase().replace(/:$/, '');
        if (t !== want) continue;
        let node = el.parentElement;
        for (let i = 0; i < 10 && node; i++) {
            if (node.querySelector('[class*="aspect-square"] img')) return node;
            node = node.parentElement;
        }
    }
    return null;
}

function getOfferSectionCards(which) {
    const root = findOfferSectionRoot(which);
    if (!root) return [];
    const skip = '#csrx-win, #csrx-overlay, #csrx-fab, #csrx-toast';
    let cards = [...root.querySelectorAll('[class*="aspect-square"]')]
        .filter(c => !c.closest(skip) && c.querySelector('img'));
    if (!cards.length) {
        cards = [...root.querySelectorAll('[class*="aspect-square"], [class*="rounded-2xl"], [class*="rounded-xl"]')]
            .filter(c => !c.closest(skip) && c.querySelector('img') && c.offsetWidth >= 60);
    }
    return cards.filter(c => !cards.some(o => o !== c && o.contains(c)));
}

function applyTradeDetailOverlays() {
    clearSkinOverlays();
    const yourCards  = getOfferSectionCards('your');
    const theirCards = getOfferSectionCards('their');
    const inv        = inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
    const trade      = getCurrentTrade();
    const yourItems  = trade ? getTradeSideItems(trade, 'your') : [];
    const theirItems = trade ? getTradeSideItems(trade, 'their') : [];

    let used = new Set();
    for (const card of yourCards) {
        let item = matchOverlayItem(card, inv, used);
        if (!item && yourItems.length) item = matchOverlayItem(card, yourItems, used);
        if (!item && tradeItemsCache.length) item = matchOverlayItem(card, tradeItemsCache, used);
        if (item) injectCardOverlay(card, item);
    }

    used = new Set();
    for (const card of theirCards) {
        let item = theirItems.length ? matchOverlayItem(card, theirItems, used) : null;
        if (!item && tradeItemsCache.length) item = matchOverlayItem(card, tradeItemsCache, used);
        if (item) injectCardOverlay(card, item);
    }

    if (!yourCards.length && !theirCards.length) applyTradeOverlays();
}

function getOfferIdFromCard(cardEl) {
    const nodes = [cardEl, cardEl.closest('a'), cardEl.parentElement, ...cardEl.querySelectorAll('a')];
    for (const el of nodes) {
        if (!el) continue;
        const href = el.href || el.getAttribute?.('href') || '';
        const m = href.match(/\/offer\/(\d+)/i);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

function getCardWear(cardEl) {
    const WEARS = ['FN', 'MW', 'FT', 'WW', 'BS'];
    for (const el of cardEl.querySelectorAll('p, span, div')) {
        const t = el.textContent?.trim();
        if (WEARS.includes(t)) return t;
    }
    return null;
}

function getCardSeedHint(cardEl) {
    for (const el of cardEl.querySelectorAll('p, span, div')) {
        const t = el.textContent?.trim();
        if (/^\d{1,4}$/.test(t)) {
            const n = parseInt(t, 10);
            if (n >= 0 && n <= 1000) return n;
        }
    }
    return null;
}

function cardHasStatTrak(cardEl) {
    for (const el of cardEl.querySelectorAll('p, span, div')) {
        const t = (el.textContent?.trim() || '').toLowerCase();
        if (t.startsWith('stattrak') || t.startsWith('stt') || t.includes('st™') || t.startsWith('st ')) return true;
    }
    return false;
}

function getStatTrakCount(cardEl) {
    for (const el of cardEl.querySelectorAll('p, span, div')) {
        const t = el.textContent?.trim() || '';
        const m = t.match(/(?:STT|ST™|StatTrak™?)\s*(\d+)/i);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

function getCardSkinNames(cardEl) {
    const lines = [...cardEl.querySelectorAll('p')]
        .map(p => p.textContent?.trim())
        .filter(t => t && !['FN', 'MW', 'FT', 'WW', 'BS'].includes(t) && !/^(STT|ST™|StatTrak)/i.test(t));
    if (lines.length >= 2) {
        return { weapon: lines[lines.length - 2], skin: lines[lines.length - 1] };
    }
    const full = lines.find(t => t.includes(' | '));
    if (full) {
        const [weapon, skin] = full.split(' | ').map(s => s.trim());
        return { weapon, skin };
    }
    return null;
}

function itemMatchesNames(item, weapon, skin, hasSt) {
    if (!item.name) return false;
    if (item.stattrak !== hasSt) return false;
    const parts = item.name.toLowerCase().split(' | ');
    if (parts.length < 2) return false;
    const wLow = weapon.toLowerCase();
    const sLow = skin.toLowerCase();
    const wOk = parts[0].includes(wLow) || wLow.includes(parts[0]);
    const sOk = parts[1].includes(sLow) || sLow.includes(parts[1]);
    return wOk && sOk;
}

function itemCacheKey(item) {
    return 'w' + (item.weapon_id ?? `${item.item_id}-${item.float}-${item.seed}`);
}

function matchItemByName(cardEl, cache, used) {
    const names = getCardSkinNames(cardEl);
    if (!names) return null;
    const hasSt = cardHasStatTrak(cardEl);
    const cands = cache.filter(i => {
        if (used.has(itemCacheKey(i))) return false;
        return itemMatchesNames(i, names.weapon, names.skin, hasSt);
    });
    if (cands.length >= 1) {
        const item = cands[0];
        used.add(itemCacheKey(item));
        return item;
    }
    return null;
}

function findCardForTradeItem(item, cards, usedCards) {
    for (const card of cards) {
        if (usedCards.has(card) || card.querySelector('.csrx-card-wrap')) continue;
        if (cardMatchesItem(card, item)) {
            usedCards.add(card);
            return card;
        }
    }
    return null;
}

function applyTradeOverlays() {
    const items = getActiveTradeItems();
    if (!items.length) return;
    const cards = getAllCards();
    if (!cards.length) return;
    const usedCards = new Set();
    for (const item of items) {
        const card = findCardForTradeItem(item, cards, usedCards);
        if (card) injectCardOverlay(card, item);
    }
}

function matchOverlayItem(cardEl, cache, used) {
    if (!cache.length) return null;

    const offerId = getOfferIdFromCard(cardEl);
    if (offerId != null) {
        const byOffer = cache.find(i => i.offer_id === offerId);
        if (byOffer && !used.has('o' + offerId)) {
            used.add('o' + offerId);
            return byOffer;
        }
    }

    const imgId = getImgItemId(cardEl);
    const wear  = getCardWear(cardEl);
    const hasSt = cardHasStatTrak(cardEl);
    const trustSiteWear = !isTradeDetailView();

    if (imgId != null) {
        const seedHint = isMarketplacePage() ? getCardSeedHint(cardEl) : null;
        const stCount  = isTradeDetailView() ? getStatTrakCount(cardEl) : null;
        let cands = cache.filter(i =>
            i.item_id === imgId &&
            !used.has('w' + (i.weapon_id ?? i.offer_id ?? `${i.item_id}-${i.float}`)) &&
            (i.stattrak === hasSt || i.stattrak == null) &&
            (!trustSiteWear || !wear || getCondition(i.float) === wear)
        );
        if (stCount != null && cands.length > 1) {
            const bySt = cands.filter(i => i.stattrak_count === stCount);
            if (bySt.length) cands = bySt;
        }
        if (seedHint != null && cands.length > 1) {
            const bySeed = cands.filter(i => i.seed === seedHint);
            if (bySeed.length) cands = bySeed;
        }
        if (cands.length >= 1) {
            const item = cands[0];
            used.add(itemCacheKey(item));
            return item;
        }
        if (isTradePickerModal() && isTheirItemsTabActive() && cands.length === 0 && imgId != null) {
            return null;
        }
    }

    if (isTradePage()) {
        const byName = matchItemByName(cardEl, cache, used);
        if (byName) return byName;
    }

    if (!isMarketplacePage() && !isTradeDetailView()) {
        const cards = getAllCards();
        const idx = cards.indexOf(cardEl);
        if (idx >= 0 && idx < cache.length && cache[idx].item_id === imgId) {
            const item = cache[idx];
            const key = 'w' + (item.weapon_id ?? item.offer_id ?? idx);
            if (!used.has(key)) { used.add(key); return item; }
        }
    }

    return null;
}

function getImgItemId(cardEl) {
    for (const img of cardEl.querySelectorAll('img')) {
        for (const attr of ['src', 'srcset', 'data-src']) {
            const raw = img.getAttribute(attr) || '';
            let dec = decodeURIComponent(raw);
            let m = dec.match(/\/skins\/(\d+)\.png/i);
            if (m) return parseInt(m[1], 10);
            m = dec.match(/skins%2F(\d+)\.png/i);
            if (m) return parseInt(m[1], 10);
        }
    }
    return null;
}

function getAllCards() {
    const skip = '#csrx-win, #csrx-overlay, #csrx-fab, #csrx-toast';
    let cards = [...document.querySelectorAll('[class*="aspect-square"][class*="rounded-2xl"]')]
        .filter(c => !c.closest(skip) && c.querySelector('img'));
    if (!cards.length) {
        cards = [...document.querySelectorAll('[class*="aspect-square"][class*="rounded-xl"]')]
            .filter(c => !c.closest(skip) && c.querySelector('img'));
    }
    if (cards.length) {
        return cards.filter(c => !cards.some(other => other !== c && other.contains(c)));
    }
    const selectors = [
        '[class*="aspect-square"][class*="rounded-2xl"][class*="flex-col"]',
        'a[href*="/offer/"] [class*="rounded-2xl"][class*="flex-col"]',
        'a[href*="/offer/"]',
        '[class*="rounded-2xl"][class*="flex-col"][class*="cursor"]',
    ];
    for (const sel of selectors) {
        const found = [...document.querySelectorAll(sel)];
        if (!found.length) continue;
        if (sel === 'a[href*="/offer/"]') {
            return found.map(a =>
                a.querySelector('[class*="rounded-2xl"][class*="flex-col"]')
                || a.querySelector('[class*="rounded-2xl"]')
                || a
            );
        }
        return found;
    }
    return [];
}

function injectCardOverlay(cardEl, item) {
    if (cardEl.querySelector('.csrx-card-wrap')) return;
    if (!item) return;

    const pos = getComputedStyle(cardEl).position;
    if (pos === 'static') cardEl.style.position = 'relative';

    const f   = item.float;
    const col = wearColor(f);
    const wrap = document.createElement('div');
    wrap.className = 'csrx-card-wrap' + (isMarketplacePage() ? ' csrx-mp-pos' : '');

    if (f != null) {
        const pill = document.createElement('div');
        pill.className = 'csrx-float-badge';
        pill.style.color = col;
        pill.style.borderColor = col + '20';

        const dot = document.createElement('span');
        dot.className = 'csrx-float-dot';
        dot.style.background = col;
        pill.appendChild(dot);

        const txt = document.createElement('span');
        txt.textContent = `${getCondition(f)} · ${f.toFixed(4)}`;
        pill.appendChild(txt);
        wrap.appendChild(pill);
    }

    if (item.seed != null) {
        const seed = document.createElement('div');
        seed.className = 'csrx-seed-badge';
        seed.textContent = `#${item.seed}`;
        wrap.appendChild(seed);
    }

    cardEl.appendChild(wrap);
}

/* ── Browse: search & filters (inventory + marketplace) ── */

let browseToolsActive = false;
let browseDebounce    = null;
let browseInitTimer   = null;

function isBrowsePage() {
    return isInventoryPage() || isMarketplacePage();
}

function isSubNavTab(el) {
    const row = el.closest('div, nav, section') || el.parentElement;
    if (!row) return false;
    const t = (row.textContent || '').toLowerCase();
    return t.includes('cases') && t.includes('quests') && t.includes('trades');
}

function findBrowseHeading() {
    const label = isMarketplacePage() ? 'marketplace' : 'inventory';
    const skip = '#csrx-browse,#csrx-win,#csrx-fab,#csrx-overlay,#csrx-toast';
    const candidates = [];
    for (const el of document.querySelectorAll('h1, h2, h3, p, span, div')) {
        if (el.closest(skip)) continue;
        if (isSubNavTab(el)) continue;
        const t = (el.textContent || '').trim().toLowerCase();
        if (t !== label) continue;
        if (t.length > 24) continue;
        candidates.push(el);
    }
    candidates.sort((a, b) => {
        const aTab = isSubNavTab(a) ? 1 : 0;
        const bTab = isSubNavTab(b) ? 1 : 0;
        if (aTab !== bTab) return aTab - bTab;
        return a.textContent.length - b.textContent.length;
    });
    return candidates[0] || null;
}

function findBrowseMountPoint() {
    const cards = getAllCards();
    if (cards.length) {
        const grid = getCardGridParent(cards);
        if (grid) return { mode: 'before', el: grid };
    }

    const h = findBrowseHeading();
    if (!h) return null;

    let node = h;
    for (let i = 0; i < 10 && node; i++) {
        const next = node.nextElementSibling;
        if (next && next.querySelector('[class*="aspect-square"] img')) {
            return { mode: 'after', el: node };
        }
        node = node.parentElement;
    }
    const row = h.parentElement;
    return row ? { mode: 'after', el: row } : { mode: 'after', el: h };
}

function scheduleBrowseInit() {
    clearTimeout(browseInitTimer);
    browseInitTimer = setTimeout(() => {
        if (isBrowsePage() && !document.getElementById('csrx-browse')) initBrowseTools();
    }, 150);
}

function getCardSearchText(card) {
    const names = getCardSkinNames(card);
    if (names) return `${names.weapon} ${names.skin}`.toLowerCase();
    return (card.textContent || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
}

function getCardPriceFromDom(cardEl) {
    for (const el of cardEl.querySelectorAll('p, span, div')) {
        const t = (el.textContent || '').trim();
        if (!/^[\d,]+$/.test(t)) continue;
        const n = parseInt(t.replace(/,/g, ''), 10);
        if (n >= 100) return n;
    }
    return null;
}

function getBrowseCache() {
    if (isMarketplacePage()) return marketplaceCache;
    return inventoryCache.map(normalizeInventoryEntry).filter(Boolean);
}

function buildCardItemMap(cards, cache) {
    const used = new Set();
    const map = new Map();
    for (const card of cards) {
        let item = matchOverlayItem(card, cache, used);
        if (!item) item = matchItemByName(card, cache, used);
        map.set(card, item);
    }
    return map;
}

function getCardGridParent(cards) {
    if (!cards.length) return null;
    let parent = cards[0].parentElement;
    for (let i = 0; i < 4 && parent; i++) {
        const childCards = [...parent.children].filter(ch =>
            cards.some(c => c === ch || ch.contains(c))
        );
        if (childCards.length >= Math.min(3, cards.length)) return parent;
        parent = parent.parentElement;
    }
    return cards[0].parentElement;
}

function ensureCardOrder(cards) {
    cards.forEach((c, i) => {
        if (c.dataset.csrxOrder == null) c.dataset.csrxOrder = String(i);
    });
}

function restoreCardOrder(cards, grid) {
    if (!grid) return;
    ensureCardOrder(cards);
    [...cards].sort((a, b) =>
        (parseInt(a.dataset.csrxOrder, 10) || 0) - (parseInt(b.dataset.csrxOrder, 10) || 0)
    ).forEach(c => grid.appendChild(c));
}

function readBrowseFilters() {
    const bar = document.getElementById('csrx-browse');
    if (!bar) return null;
    return {
        q: (bar.querySelector('#csrx-browse-search')?.value || '').trim().toLowerCase(),
        rarity: bar.querySelector('#csrx-browse-rarity')?.value || '',
        wear: bar.querySelector('#csrx-browse-wear')?.value || '',
        floatSort: bar.querySelector('#csrx-browse-float')?.value || '',
        priceSort: bar.querySelector('#csrx-browse-price')?.value || '',
    };
}

function cardPassesBrowseFilters(card, item, f) {
    const text = getCardSearchText(card);
    if (f.q && !text.includes(f.q)) return false;

    if (f.rarity !== '') {
        if (!item) return false;
        if (String(parseInt(item.rarity, 10)) !== f.rarity) return false;
    }

    const wear = f.wear;
    if (wear) {
        const cardWear = item?.float != null ? getCondition(item.float) : getCardWear(card);
        if (cardWear !== wear) return false;
    }

    return true;
}

function applyBrowseFilters() {
    const bar = document.getElementById('csrx-browse');
    if (!bar || !isBrowsePage()) return;

    const f = readBrowseFilters();
    if (!f) return;

    const cards = getAllCards();
    if (!cards.length) {
        bar.querySelector('#csrx-browse-count').textContent = '';
        return;
    }

    ensureCardOrder(cards);
    const cache = getBrowseCache();
    const itemMap = buildCardItemMap(cards, cache);
    const grid = getCardGridParent(cards);
    const mp = isMarketplacePage();

    let visible = [];
    for (const card of cards) {
        const item = itemMap.get(card);
        const pass = cardPassesBrowseFilters(card, item, f);
        card.classList.toggle('csrx-browse-hidden', !pass);
        if (pass) visible.push({ card, item });
    }

    if (mp && f.priceSort && visible.length > 1) {
        visible.sort((a, b) => {
            const pa = a.item?.price ?? getCardPriceFromDom(a.card) ?? 0;
            const pb = b.item?.price ?? getCardPriceFromDom(b.card) ?? 0;
            return f.priceSort === 'asc' ? pa - pb : pb - pa;
        });
        visible.forEach(({ card }) => grid?.appendChild(card));
    } else if (f.floatSort && visible.length > 1) {
        visible.sort((a, b) => {
            const fa = a.item?.float ?? 1;
            const fb = b.item?.float ?? 1;
            return f.floatSort === 'asc' ? fa - fb : fb - fa;
        });
        visible.forEach(({ card }) => grid?.appendChild(card));
    } else {
        restoreCardOrder(cards, grid);
    }

    const countEl = bar.querySelector('#csrx-browse-count');
    if (countEl) {
        countEl.textContent = visible.length === cards.length
            ? `${cards.length} items`
            : `Showing ${visible.length} of ${cards.length} items`;
    }
}

function scheduleBrowseFilters() {
    clearTimeout(browseDebounce);
    browseDebounce = setTimeout(applyBrowseFilters, 120);
}

function clearBrowseFilters() {
    const bar = document.getElementById('csrx-browse');
    if (!bar) return;
    bar.querySelector('#csrx-browse-search').value = '';
    bar.querySelector('#csrx-browse-rarity').value = '';
    bar.querySelector('#csrx-browse-wear').value = '';
    bar.querySelector('#csrx-browse-float').value = '';
    const price = bar.querySelector('#csrx-browse-price');
    if (price) price.value = '';
    applyBrowseFilters();
}

function buildBrowseBar() {
    const mp = isMarketplacePage();
    const wrap = document.createElement('div');
    wrap.id = 'csrx-browse';

    const rarityOpts = ['<option value="">All rarities</option>']
        .concat(Object.entries(RARITY).map(([k, v]) =>
            `<option value="${k}">${v.name}</option>`
        )).join('');

    const wearOpts = ['<option value="">All wear</option>',
        '<option value="FN">Factory New</option>',
        '<option value="MW">Minimal Wear</option>',
        '<option value="FT">Field-Tested</option>',
        '<option value="WW">Well-Worn</option>',
        '<option value="BS">Battle-Scarred</option>',
    ].join('');

    const floatOpts = ['<option value="">Float order</option>',
        '<option value="asc">Float: Low → High</option>',
        '<option value="desc">Float: High → Low</option>',
    ].join('');

    const priceOpts = mp ? [
        '<select id="csrx-browse-price" title="Sort by price">',
        '<option value="">Price order</option>',
        '<option value="asc">Cheapest first</option>',
        '<option value="desc">Most expensive first</option>',
        '</select>',
    ].join('') : '';

    wrap.innerHTML = `
<div class="csrx-browse-row">
    <input id="csrx-browse-search" type="search" placeholder="Search weapon or skin…" autocomplete="off" spellcheck="false">
    <div class="csrx-browse-filters">
        <select id="csrx-browse-rarity" title="Filter by rarity">${rarityOpts}</select>
        <select id="csrx-browse-wear" title="Filter by wear">${wearOpts}</select>
        <select id="csrx-browse-float" title="Sort by float">${floatOpts}</select>
        ${priceOpts}
        <button type="button" id="csrx-browse-clear">Clear</button>
    </div>
</div>
<div id="csrx-browse-count"></div>`;

    wrap.querySelector('#csrx-browse-search').addEventListener('input', scheduleBrowseFilters);
    wrap.querySelectorAll('select').forEach(el => el.addEventListener('change', applyBrowseFilters));
    wrap.querySelector('#csrx-browse-clear').addEventListener('click', clearBrowseFilters);
    return wrap;
}

function initBrowseTools() {
    if (!isBrowsePage() || document.getElementById('csrx-browse')) return;
    const mount = findBrowseMountPoint();
    if (!mount?.el) return;
    const bar = buildBrowseBar();
    if (mount.mode === 'before') {
        mount.el.insertAdjacentElement('beforebegin', bar);
    } else {
        mount.el.insertAdjacentElement('afterend', bar);
    }
    browseToolsActive = true;
    applyBrowseFilters();
}

function stopBrowseTools() {
    browseToolsActive = false;
    clearTimeout(browseDebounce);
    clearTimeout(browseInitTimer);
    document.getElementById('csrx-browse')?.remove();
    getAllCards().forEach(c => {
        c.classList.remove('csrx-browse-hidden');
        delete c.dataset.csrxOrder;
    });
}

function applyOverlaysToAll() {
    if (isTradeDetailView()) {
        applyTradeDetailOverlays();
        return;
    }

    clearSkinOverlays();
    const cards = getAllCards();
    if (isBrowsePage()) {
        scheduleBrowseInit();
        if (document.getElementById('csrx-browse')) scheduleBrowseFilters();
    }
    if (!cards.length) return;

    const cache = getOverlayCache();
    if (!cache.length) return;
    const used = new Set();
    cards.forEach(cardEl => {
        if (cardEl.querySelector('.csrx-card-wrap')) return;
        const item = matchOverlayItem(cardEl, cache, used);
        if (item) injectCardOverlay(cardEl, item);
    });
}

async function startAlwaysOnOverlay() {
    if (overlayRunning) return;
    overlayRunning = true;
    if (isMarketplacePage()) {
        await fetchMarketplace();
    } else if (isTradePage() || isTradeDetailView() || isTradePickerModal()) {
        inventoryCache = await fetchInventory();
    } else {
        inventoryCache = await fetchInventory();
    }
    applyOverlaysToAll();
    overlayTimer = setInterval(() => {
        if (!overlayRunning) return;
        applyOverlaysToAll();
    }, 2000);
}

function stopAlwaysOnOverlay() {
    overlayRunning = false;
    clearInterval(overlayTimer);
    overlayTimer = null;
    document.querySelectorAll('.csrx-card-wrap').forEach(el => el.remove());
}

function checkPageAndRun() {
    const onOverlay = isOverlayPage();
    const onBrowse  = isBrowsePage();
    const kind = isMarketplacePage() ? 'mp'
        : (isTradePage() || isTradeDetailView() || isTradePickerModal()) ? 'trade'
        : 'inv';

    if (!onOverlay) {
        if (overlayRunning) stopAlwaysOnOverlay();
        overlayPageKind = null;
        stopBrowseTools();
        browsePageKind = null;
        return;
    }

    if (!onBrowse) {
        stopBrowseTools();
        browsePageKind = null;
    } else {
        const bk = isMarketplacePage() ? 'mp' : 'inv';
        if (browsePageKind !== bk) {
            stopBrowseTools();
            browsePageKind = bk;
        }
        if (!document.getElementById('csrx-browse')) scheduleBrowseInit();
        else scheduleBrowseFilters();
    }

    if (overlayRunning && overlayPageKind !== kind) stopAlwaysOnOverlay();

    if (!overlayRunning) {
        overlayPageKind = kind;
        startAlwaysOnOverlay();
    } else if (kind === 'mp' && !marketplaceCache.length) {
        fetchMarketplace().then(() => applyOverlaysToAll());
    }
}

checkPageAndRun();
setInterval(checkPageAndRun, 800);

document.addEventListener('click', e => {
    const t = e.target?.textContent?.trim() || '';
    if (/^(my items|their items)$/i.test(t) && isTradePickerModal()) scheduleApplyOverlays();
}, true);

const fab = document.createElement('div');
fab.id = 'csrx-fab';
fab.title = 'CSR Seller — vender itens do inventário';
fab.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
</svg>`;
document.body.appendChild(fab);

const win = document.createElement('div');
win.id = 'csrx-win';
win.innerHTML = `
<div id="csrx-win-top"></div>
<div id="csrx-hdr">
    <div class="csrx-logo">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
        </svg>
    </div>
    <div class="csrx-hdr-text">
        <div class="csrx-hdr-title">CSR Seller</div>
        <div class="csrx-hdr-sub">Inventory Manager</div>
    </div>
    <div id="csrx-winx">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
    </div>
</div>
<div id="csrx-statusbar">
    <div class="csrx-dot" id="csrx-dot"></div>
    <span id="csrx-stat">Ready</span>
</div>
<div id="csrx-body">
    <div>
        <div class="csrx-section">Picker</div>
        <div style="display:flex;flex-direction:column;gap:7px;">
            <button id="csrx-modbtn" class="csrx-btn csrx-btn-primary">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Start Picking
            </button>
            <div id="csrx-picked-info">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span id="csrx-picked-count">0 items selected</span>
            </div>
            <button id="csrx-selbtn" class="csrx-btn csrx-btn-success" style="display:none;" disabled>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Review &amp; Sell
            </button>
        </div>
    </div>
    <div>
        <div class="csrx-section">Global</div>
        <div style="display:flex;flex-direction:column;gap:7px;">
            <select id="csrx-rar" class="csrx-sel">
                <option value="6">Consumer Grade</option>
                <option value="5">Industrial Grade</option>
                <option value="4">Mil-Spec</option>
                <option value="3">Restricted</option>
                <option value="2">Classified</option>
                <option value="1">Covert / Knives</option>
                <option value="0">Contraband</option>
            </select>
            <button id="csrx-massbtn" class="csrx-btn csrx-btn-danger">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                </svg>
                Sell by Rarity
            </button>
        </div>
    </div>
    <div>
        <div class="csrx-section">Speed</div>
        <div class="csrx-slider-wrap">
            <div class="csrx-slider-row">
                <span class="csrx-slider-lbl">Batch size</span>
                <span class="csrx-slider-val" id="csrx-spdval">5</span>
            </div>
            <input type="range" id="csrx-spd" class="csrx-range" min="1" max="20" value="5">
        </div>
    </div>
</div>`;
document.body.appendChild(win);

const overlay = document.createElement('div');
overlay.id = 'csrx-overlay';
overlay.innerHTML = `
<div id="csrx-modal">
    <div id="csrx-modal-top"></div>
    <div id="csrx-mhdr">
        <div class="csrx-mhdr-left">
            <div class="csrx-mhdr-title">Confirm <span>Sale</span></div>
            <div class="csrx-mhdr-sub" id="csrx-mhdr-sub">Review items before selling</div>
        </div>
        <div id="csrx-mxbtn">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </div>
    </div>
    <div id="csrx-mprog"><div id="csrx-mbar"></div></div>
    <div id="csrx-mwarn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-top:1px;">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Some items could not be verified and will be skipped.
    </div>
    <div id="csrx-validator">
        <div class="csrx-val-title">Validation Report</div>
        <div class="csrx-val-grid" id="csrx-val-grid"></div>
    </div>
    <div id="csrx-mgrid"></div>
    <div id="csrx-mfoot">
        <div id="csrx-msumm">
            <div class="csrx-summ-count" id="csrx-summ-count">0 items</div>
            <div class="csrx-summ-sub"   id="csrx-summ-sub">ready to sell</div>
        </div>
        <button id="csrx-mcancel" class="m-btn">Cancel</button>
        <button id="csrx-msell" class="m-btn">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
            Sell Items
        </button>
    </div>
</div>`;
document.body.appendChild(overlay);

const toastEl = document.createElement('div');
toastEl.id = 'csrx-toast';
document.body.appendChild(toastEl);

let _tt;
function toast(msg, type = 'success') {
    clearTimeout(_tt);
    const cfg = {
        success: { col:'#22c55e' },
        error:   { col:'#ef4444' },
        warn:    { col:'#f59e0b' },
        info:    { col:'#fff'    },
    };
    const c = cfg[type] || cfg.info;
    const icons = {
        success:`<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        error:  `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        warn:   `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        info:   `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="10"/></svg>`,
    };
    toastEl.style.borderColor = c.col + '20';
    toastEl.innerHTML = `
        <div class="csrx-toast-icon" style="background:${c.col}18;border:1px solid ${c.col}25;">
            <span style="color:${c.col}">${icons[type]||icons.info}</span>
        </div>
        <span>${msg}</span>`;
    toastEl.classList.add('show');
    _tt = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

{
    let drag=false,ox=0,oy=0;
    document.getElementById('csrx-hdr').addEventListener('mousedown',e=>{
        if(e.target.closest('#csrx-winx'))return;
        drag=true; ox=e.clientX; oy=e.clientY;
    });
    document.addEventListener('mouseup',()=>{drag=false;});
    document.addEventListener('mousemove',e=>{
        if(!drag)return;
        const r=win.getBoundingClientRect();
        win.style.left=(r.left+e.clientX-ox)+'px';
        win.style.top=(r.top+e.clientY-oy)+'px';
        win.style.right='auto';
        ox=e.clientX; oy=e.clientY;
    });
}

function setStatus(text, state='ready') {
    const dot=document.getElementById('csrx-dot');
    document.getElementById('csrx-stat').textContent=text;
    dot.className='csrx-dot';
    if(state==='syncing') dot.classList.add('syncing');
    if(state==='active')  dot.classList.add('active');
}

let serverInv=[], selMode=false, selling=false;
let picked=new Map();
const btnMode=document.getElementById('csrx-modbtn');
const btnSell=document.getElementById('csrx-selbtn');

async function apiInv() {
    try {
        const r=await fetch('https://api.csrestored.fun/inventory/',{credentials:'include'});
        if(!r.ok) throw r.status;
        const d=await r.json();
        const arr=Array.isArray(d)?d:(d.items||d.inventory||d.data||[]);
        return arr.sort((a,b)=>parseInt(a.rarity)-parseInt(b.rarity));
    } catch(e){return [];}
}
async function apiSell(wid) {
    try {
        const r=await fetch(`https://api.csrestored.fun/inventory/sell/${wid}`,{
            method:'POST',credentials:'include',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({weapon_id:parseInt(wid)})
        });
        return r.ok;
    } catch(e){return false;}
}

function findCard(target) {
    let el=target;
    for(let i=0;i<15;i++){
        if(!el||el===document.body)return null;
        const cl=el.className||'';
        if(typeof cl==='string'&&cl.includes('aspect-square')&&cl.includes('rounded-2xl')&&cl.includes('flex-col'))return el;
        el=el.parentElement;
    }
    return null;
}

function matchCard(cardEl, inv, usedIds) {
    const cards=getAllCards(); const idx=cards.indexOf(cardEl); const imgId=getImgItemId(cardEl);
    if(idx>=0&&idx<inv.length){
        const cand=inv[idx];
        if(imgId===cand.item_id&&!usedIds.has(cand.weapon_id))return{item:cand,confidence:'high'};
    }
    const paras=[...cardEl.querySelectorAll('p')];
    const wear=paras.find(p=>['FN','MW','FT','WW','BS'].includes(p.textContent?.trim()))?.textContent?.trim();
    const hasSt=(paras[0]?.textContent?.trim()||'').toLowerCase().startsWith('stattrak');
    if(imgId!=null){
        const cands=inv.filter(i=>i.item_id===imgId&&!usedIds.has(i.weapon_id)&&(!wear||getCondition(i.float)===wear)&&i.stattrak===hasSt);
        if(cands.length===1)return{item:cands[0],confidence:'medium'};
        if(cands.length>1) return{item:cands[0],confidence:'low'};
        const c2=inv.filter(i=>i.item_id===imgId&&!usedIds.has(i.weapon_id)&&(!wear||getCondition(i.float)===wear));
        if(c2.length>0)return{item:c2[0],confidence:'low'};
    }
    return null;
}

let winOpen=false;
document.getElementById('csrx-winx').addEventListener('click',()=>{winOpen=false;if(selMode)exitSel();});
fab.addEventListener('click',()=>{winOpen=true;});
setInterval(()=>{
    const onInv=isInventoryPage();
    if(onInv){
        win.style.display=winOpen?'flex':'none';
        fab.style.display=winOpen?'none':'flex';
    } else {
        win.style.display='none'; fab.style.display='none';
        if(selMode)exitSel();
    }
},400);
document.getElementById('csrx-spd').addEventListener('input',e=>{
    document.getElementById('csrx-spdval').textContent=e.target.value;
});

function enterSel() {
    selMode=true;
    serverInv=inventoryCache;
    setStatus('Click to pick','active');
    btnMode.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cancel`;
    btnMode.className='csrx-btn csrx-btn-cancel';
    btnSell.style.display='block';
    document.getElementById('csrx-picked-info').classList.add('show');
    updateSelBtn();
}
function exitSel() {
    selMode=false; setStatus('Ready','ready');
    btnMode.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Start Picking`;
    btnMode.className='csrx-btn csrx-btn-primary';
    btnSell.style.display='none';
    document.getElementById('csrx-picked-info').classList.remove('show');
    picked.forEach((_,el)=>cleanCard(el)); picked.clear(); updateSelBtn();
}
function cleanCard(el) {
    el.classList.remove('csrx-picked');
    el.querySelector('.csrx-check-badge')?.remove();
    delete el._csrxWid; delete el._csrxConf;
}
btnMode.addEventListener('click',()=>selMode?exitSel():enterSel());

function updateSelBtn() {
    const n=picked.size;
    document.getElementById('csrx-picked-count').textContent=`${n} item${n!==1?'s':''} selected`;
    btnSell.innerHTML=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Review &amp; Sell (${n})`;
    btnSell.disabled=n===0;
}

document.addEventListener('click',e=>{
    if(!selMode)return;
    if(e.target.closest('#csrx-win')||e.target.closest('#csrx-overlay')||e.target.closest('#csrx-toast'))return;
    e.preventDefault(); e.stopPropagation();
    const card=findCard(e.target);
    if(!card)return;
    if(picked.has(card)){
        picked.delete(card); cleanCard(card);
    } else {
        const usedIds=new Set([...picked.values()].filter(v=>v!=null));
        const result=matchCard(card,serverInv,usedIds);
        if(result){
            card._csrxWid=result.item.weapon_id; card._csrxConf=result.confidence;
            picked.set(card,result.item.weapon_id);
            if(result.confidence==='low')toast('Ambiguous match — verify in modal','warn');
        } else {
            card._csrxWid=null; card._csrxConf='none';
            picked.set(card,null); toast('Item not found in inventory','error');
        }
        card.classList.add('csrx-picked');
        const chk=document.createElement('div'); chk.className='csrx-check-badge';
        chk.innerHTML=`<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        card.appendChild(chk);
    }
    updateSelBtn();
},true);

function validateItems(entries,freshInv) {
    return entries.map(({cardEl,weaponId})=>{
        if(weaponId==null)return{cardEl,weaponId,item:null,status:'not_found',msg:'Not matched'};
        const fresh=freshInv.find(i=>i.weapon_id===weaponId);
        if(!fresh)return{cardEl,weaponId,item:null,status:'sold_or_missing',msg:'No longer in inventory'};
        if(cardEl){const imgId=getImgItemId(cardEl);if(imgId!=null&&imgId!==fresh.item_id)return{cardEl,weaponId,item:fresh,status:'mismatch',msg:'Image mismatch'};}
        return{cardEl,weaponId,item:fresh,status:'ok',msg:'Verified'};
    });
}

function buildMC(entry) {
    const{item,status}=entry;
    const isOk=status==='ok';
    const rNum=item?parseInt(item.rarity):6;
    const rInfo=RARITY[rNum]??RARITY[6];
    const hex=rInfo.hex;

    const wrap=document.createElement('div');
    wrap.className='mc'+(isOk?' mc-confirmed':' mc-bad');
    if(isOk){
        const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
        wrap.style.background=`linear-gradient(160deg,rgba(${r},${g},${b},0.07) 0%,#111 55%)`;
    }

    const rline=document.createElement('div'); rline.className='mc-rline';
    rline.style.background=isOk?hex:'#ef4444';
    rline.style.opacity='0.6';
    wrap.appendChild(rline);

    if(isOk){
        const vb=document.createElement('div'); vb.className='mc-verified';
        vb.innerHTML=`<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        wrap.appendChild(vb);
    }

    const imgZ=document.createElement('div'); imgZ.className='mc-img';
    if(!item){
        imgZ.innerHTML=`<div class="mc-img-ph">❓</div>`;
    } else {
        const img=document.createElement('img');
        img.src=`https://cdn.csrestored.fun/skins/${item.item_id}.png`; img.alt=wName(item);
        img.onerror=function(){this.style.display='none';const ph=document.createElement('div');ph.className='mc-img-ph';ph.textContent='🔫';imgZ.appendChild(ph);};
        imgZ.appendChild(img);
        if(item.float!=null){
            const wc=document.createElement('div'); wc.className='mc-wear';
            const col=wearColor(item.float); wc.style.color=col;
            wc.textContent=getCondition(item.float); imgZ.appendChild(wc);
        }
    }
    wrap.appendChild(imgZ);

    const rm=document.createElement('div'); rm.className='mc-rm';
    rm.innerHTML=`<svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    wrap.appendChild(rm);

    const body=document.createElement('div'); body.className='mc-body';
    if(!item){
        body.innerHTML=`<div class="mc-weapon">Unknown</div><div class="mc-skin" style="color:#ef4444;">Not Found</div><div style="margin-top:4px;font-size:9px;font-weight:500;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.15);display:inline-block;">${entry.msg||'Error'}</div>`;
    } else {
        const f=item.float,col=wearColor(f);
        const wn=document.createElement('div');wn.className='mc-weapon';wn.textContent=wName(item);body.appendChild(wn);
        const sn=document.createElement('div');sn.className='mc-skin';sn.style.color=hex;sn.textContent=sName(item);body.appendChild(sn);

        if(f!=null){
            const fr=document.createElement('div');fr.className='mc-float-row';
            const fc=document.createElement('span');fc.className='mc-float-cond';fc.style.color=col;fc.style.background=col+'12';fc.textContent=getCondition(f);fr.appendChild(fc);
            const fv=document.createElement('span');fv.className='mc-float-num';fv.textContent=f.toFixed(6);fr.appendChild(fv);
            body.appendChild(fr);
        }
        if(item.seed!=null){
            const pr=document.createElement('div');pr.className='mc-pattern-row';
            const pl=document.createElement('span');pl.className='mc-pattern-lbl';pl.textContent='Pattern';
            const pn=document.createElement('span');pn.className='mc-pattern-num';pn.textContent=`#${item.seed}`;
            pr.appendChild(pl);pr.appendChild(pn);body.appendChild(pr);
        }
        const dv=document.createElement('div');dv.className='mc-divider';body.appendChild(dv);
        const rn=document.createElement('div');rn.className='mc-rarity';rn.style.color=hex;rn.textContent=rInfo.name;body.appendChild(rn);
        const idR=document.createElement('div');idR.className='mc-id';idR.textContent=`ID: ${item.weapon_id}`;body.appendChild(idR);
        if(item.stattrak){const st=document.createElement('div');st.className='mc-st';st.textContent=`StatTrak™ ${item.stattrak_count??''}`;body.appendChild(st);}
        if(item.nametag){const tg=document.createElement('div');tg.className='mc-tag';tg.textContent=`"${item.nametag}"`;body.appendChild(tg);}
        const sb=document.createElement('div');sb.className='mc-statusbar';
        const bc=status==='ok'?'#22c55e':status==='mismatch'?'#f59e0b':'#ef4444';
        sb.style.background=bc;body.appendChild(sb);
    }
    wrap.appendChild(body);
    return{wrap,rm};
}

let modalEntries=[];

function refreshFooter(){
    const all=[...document.querySelectorAll('#csrx-mgrid .mc')];
    const good=all.filter(c=>c.classList.contains('mc-confirmed')).length;
    const bad=all.filter(c=>c.classList.contains('mc-bad')).length;
    document.getElementById('csrx-summ-count').textContent=`${good} item${good!==1?'s':''}`;
    document.getElementById('csrx-summ-sub').textContent=good>0?'verified & ready':'nothing to sell';
    const sb=document.getElementById('csrx-msell');
    sb.innerHTML=`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> Sell ${good} Item${good!==1?'s':''}`;
    sb.disabled=good===0;
    document.getElementById('csrx-mwarn').classList.toggle('show',bad>0);
    document.getElementById('csrx-mhdr-sub').textContent=`${good} verified · ${bad} skipped · ${all.length} total`;
}

function buildValidatorPanel(entries){
    const panel=document.getElementById('csrx-validator');
    const grid=document.getElementById('csrx-val-grid');
    grid.innerHTML='';
    const issues=entries.filter(e=>e.status!=='ok');
    if(!issues.length){panel.classList.remove('show');return;}
    panel.classList.add('show');
    issues.forEach(e=>{
        const row=document.createElement('div');row.className='csrx-val-row';
        const sc={ok:'vsok',mismatch:'vswarn',not_found:'vserr',sold_or_missing:'vserr'}[e.status]||'vserr';
        const sl={ok:'OK',mismatch:'Warn',not_found:'Error',sold_or_missing:'Gone'}[e.status]||'?';
        const sc2=e.status==='mismatch'?'#f59e0b':'#ef4444';
        row.innerHTML=`<svg class="csrx-val-icon" viewBox="0 0 24 24" fill="none" stroke="${sc2}" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span class="csrx-val-name">${e.item?.name||`ID: ${e.weaponId}`}</span><span class="csrx-val-status ${sc}">${sl}</span>`;
        grid.appendChild(row);
    });
}

async function openModal(entries){
    setStatus('Validating…','syncing');
    const fresh=await apiInv(); setStatus('Review','active');
    const validated=validateItems(entries,fresh); modalEntries=validated;
    const grid=document.getElementById('csrx-mgrid'); grid.innerHTML=''; document.getElementById('csrx-mbar').style.width='0';
    modalEntries.forEach((entry,idx)=>{
        const{wrap,rm}=buildMC(entry); wrap.dataset.idx=idx;
        rm.addEventListener('click',()=>{wrap.remove();refreshFooter();buildValidatorPanel(modalEntries.filter((_,i)=>document.querySelector(`#csrx-mgrid .mc[data-idx="${i}"]`)));});
        grid.appendChild(wrap);
    });
    buildValidatorPanel(validated); refreshFooter(); overlay.classList.add('open');
}

function closeModal(){
    if(selling)return; overlay.classList.remove('open'); setStatus('Ready','ready');
}
document.getElementById('csrx-mxbtn').addEventListener('click',closeModal);
document.getElementById('csrx-mcancel').addEventListener('click',closeModal);
overlay.addEventListener('mousedown',e=>{if(e.target===overlay)closeModal();});
document.getElementById('csrx-modal').addEventListener('mousedown',e=>{e.stopPropagation();});

async function runSell(toSell){
    const spd=parseInt(document.getElementById('csrx-spd').value)||5;
    const bar=document.getElementById('csrx-mbar'); let sold=0,failed=0;
    for(let i=0;i<toSell.length;i+=spd){
        const chunk=toSell.slice(i,i+spd);
        await Promise.all(chunk.map(async({item,cardEl,wrapEl})=>{
            const ok=await apiSell(item.weapon_id);
            if(ok){sold++;
                if(cardEl){cardEl.style.transition='opacity .5s';cardEl.style.opacity='.1';cleanCard(cardEl);}
                if(wrapEl){wrapEl.style.opacity='.15';wrapEl.style.transition='opacity .4s';}
            } else failed++;
        }));
        bar.style.width=Math.round(Math.min(i+spd,toSell.length)/toSell.length*100)+'%';
        setStatus(`Selling ${sold}/${toSell.length}…`,'syncing');
    }
    return{sold,failed};
}

document.getElementById('csrx-msell').addEventListener('click',async()=>{
    if(selling)return; selling=true;
    const sellB=document.getElementById('csrx-msell'),cancelB=document.getElementById('csrx-mcancel'),xBtn=document.getElementById('csrx-mxbtn');
    sellB.disabled=cancelB.disabled=true; xBtn.style.pointerEvents='none'; xBtn.style.opacity='.3';
    sellB.innerHTML=`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Selling…`;
    const toSell=[];
    document.querySelectorAll('#csrx-mgrid .mc.mc-confirmed').forEach(wrapEl=>{
        const entry=modalEntries[parseInt(wrapEl.dataset.idx)];
        if(entry?.item)toSell.push({item:entry.item,cardEl:entry.cardEl,wrapEl});
    });
    const{sold,failed}=await runSell(toSell);
    selling=false; closeModal();
    toast(`Sold ${sold} item${sold!==1?'s':''}${failed?` · ${failed} failed`:''}`,sold>0?'success':'error');
    if(selMode)exitSel(); setTimeout(()=>location.reload(),1800);
});

btnSell.addEventListener('click',async()=>{
    if(!picked.size||selling)return;
    const entries=[...picked.entries()].map(([cardEl,weaponId])=>({cardEl,weaponId}));
    await openModal(entries);
});

document.getElementById('csrx-massbtn').addEventListener('click',async()=>{
    if(selling)return;
    const val=parseInt(document.getElementById('csrx-rar').value);
    setStatus('Fetching…','syncing');
    const inv=await apiInv(); setStatus('Ready','ready');
    const items=inv.filter(i=>parseInt(i.rarity)===val);
    if(!items.length){toast('No items for selected rarity','warn');return;}
    modalEntries=items.map(item=>({cardEl:null,weaponId:item.weapon_id,item,status:'ok',msg:'From API'}));
    const grid=document.getElementById('csrx-mgrid'); grid.innerHTML=''; document.getElementById('csrx-mbar').style.width='0';
    document.getElementById('csrx-validator').classList.remove('show');
    document.getElementById('csrx-mwarn').classList.remove('show');
    modalEntries.forEach((entry,idx)=>{
        const{wrap,rm}=buildMC(entry); wrap.dataset.idx=idx;
        rm.addEventListener('click',()=>{wrap.remove();refreshFooter();});
        grid.appendChild(wrap);
    });
    refreshFooter(); overlay.classList.add('open');
});
})();