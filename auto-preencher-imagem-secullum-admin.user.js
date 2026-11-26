// ==UserScript==
// @name         Auto Preencher Imagem - Secullum Admin
// @namespace    local.secullum
// @version      1.0.0
// @description  Define um Base Path persistente na barra superior do Secullum Admin (aba Incluir) e preenche automaticamente Título e Caminho ao selecionar um arquivo de imagem.
// @author       Luiz Gustavo Dias Pulz
// @match        https://www.secullum.com.br/pt/admin*
// @updateURL    https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/auto-preencher-imagem-secullum-admin.user.js
// @downloadURL  https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/auto-preencher-imagem-secullum-admin.user.js
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY_BASE_PATH = 'secullum_admin_img_base_path';
    const STORAGE_KEY_HISTORY = 'secullum_admin_img_base_path_history';
    const MAX_HISTORY_ITEMS = 5;

    const TRIGGER_ID = 'secullum-bp-trigger';
    const POPOVER_ID = 'secullum-bp-popover';
    const INPUT_ID = 'secullum-bp-input';
    const PREVIEW_ID = 'secullum-bp-preview';
    const STATUS_ID = 'secullum-bp-status';
    const HISTORY_ID = 'secullum-bp-history';
    const SAVE_BTN_ID = 'secullum-bp-save';
    const CLEAR_BTN_ID = 'secullum-bp-clear';

    const supportsNativePopover =
        typeof HTMLElement !== 'undefined' &&
        Object.hasOwn(HTMLElement.prototype, 'popover');

    const supportsAnchorPositioning =
        typeof CSS !== 'undefined' &&
        typeof CSS.supports === 'function' &&
        CSS.supports('position-area: block-end');

    let syncScheduled = false;
    let stylesInjected = false;
    let fallbackOpen = false;
    let triggerWarningMsg = '';

    // -------------------------------------------------------------------------
    // Persistência (GM_getValue / GM_setValue)
    // -------------------------------------------------------------------------

    function getSavedBasePath() {
        try {
            const raw = GM_getValue(STORAGE_KEY_BASE_PATH, '');
            return sanitizeBasePath(raw);
        } catch (err) {
            return '';
        }
    }

    function getSavedHistory() {
        try {
            const raw = GM_getValue(STORAGE_KEY_HISTORY, []);
            const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!Array.isArray(list)) return [];
            const seen = new Set();
            const normalized = [];
            for (const item of list) {
                const clean = sanitizeBasePath(item);
                if (clean && !seen.has(clean)) {
                    seen.add(clean);
                    normalized.push(clean);
                }
                if (normalized.length >= MAX_HISTORY_ITEMS) break;
            }
            return normalized;
        } catch (err) {
            return [];
        }
    }

    function saveBasePath(rawPath) {
        const clean = sanitizeBasePath(rawPath);
        if (!clean) {
            clearBasePath();
            return '';
        }

        GM_setValue(STORAGE_KEY_BASE_PATH, clean);

        const nextHistory = [clean, ...getSavedHistory().filter((item) => item !== clean)]
            .slice(0, MAX_HISTORY_ITEMS);
        GM_setValue(STORAGE_KEY_HISTORY, nextHistory);
        triggerWarningMsg = '';
        return clean;
    }

    function clearBasePath() {
        GM_setValue(STORAGE_KEY_BASE_PATH, '');
        triggerWarningMsg = '';
    }

    function removeHistoryItem(pathToRemove) {
        const cleanTarget = sanitizeBasePath(pathToRemove);
        const nextHistory = getSavedHistory().filter((item) => item !== cleanTarget);
        GM_setValue(STORAGE_KEY_HISTORY, nextHistory);
        if (getSavedBasePath() === cleanTarget) {
            clearBasePath();
        }
    }

    // -------------------------------------------------------------------------
    // Helpers puros de caminho e nome de arquivo
    // -------------------------------------------------------------------------

    function sanitizeBasePath(raw) {
        let clean = String(raw || '').trim();
        clean = clean.replace(/^["']+|["']+$/g, '').trim();
        if (!clean) return '';
        if (/^\/+$/.test(clean)) return '/';
        if (/^[a-zA-Z]:[\\/]*$/.test(clean)) {
            return `${clean[0]}:\\`;
        }
        return clean.replace(/[\\/]+$/, '');
    }

    function detectSeparator(basePath) {
        const clean = String(basePath || '');
        if (clean.includes('\\') || /^[a-zA-Z]:/.test(clean)) {
            return '\\';
        }
        if (clean.includes('/')) {
            return '/';
        }
        return '\\';
    }

    function stripFileExtension(fileName) {
        const clean = String(fileName || '').trim();
        const lastDot = clean.lastIndexOf('.');
        if (lastDot > 0) {
            return clean.slice(0, lastDot);
        }
        return clean;
    }

    function buildQuotedFullPath(basePath, fileName) {
        const cleanBase = sanitizeBasePath(basePath);
        const cleanFile = String(fileName || '').trim();
        if (!cleanBase || !cleanFile) return '';

        const sep = detectSeparator(cleanBase);
        const joined = cleanBase.endsWith(sep)
            ? `${cleanBase}${cleanFile}`
            : `${cleanBase}${sep}${cleanFile}`;

        return `"${joined}"`;
    }

    // -------------------------------------------------------------------------
    // Detecção de rota e contexto da tela "Inserir Imagem"
    // -------------------------------------------------------------------------

    function isAdminRootRoute(pathname = window.location.pathname) {
        return String(pathname || '').replace(/\/+$/, '') === '/pt/admin';
    }

    function getInsertImageContext() {
        if (!isAdminRootRoute()) return null;

        const forms = document.querySelectorAll('form');
        for (const form of forms) {
            const tituloInput = form.querySelector('input[name="titulo"]');
            const caminhoInput = form.querySelector('input[name="caminho"]');
            const fileInput = form.querySelector('input[type="file"]');
            if (!tituloInput || !caminhoInput || !fileInput) continue;

            const container = form.parentElement;
            const heading = container ? container.querySelector('h2') : null;
            if (!heading || heading.textContent.trim().toLowerCase() !== 'inserir imagem') {
                continue;
            }

            const fileNameInput = fileInput.parentElement
                ? fileInput.parentElement.querySelector('input[type="text"][disabled]')
                : null;

            return { form, tituloInput, caminhoInput, fileInput, fileNameInput };
        }

        return null;
    }

    function findLogoutAnchor() {
        const adminNavLink = document.querySelector('a[href="/pt/admin"]');
        const navList = adminNavLink ? adminNavLink.closest('ul') : null;
        const topbar = navList ? navList.parentElement : null;
        if (!topbar) return null;

        const anchors = topbar.querySelectorAll('a');
        for (const anchor of anchors) {
            if (navList.contains(anchor)) continue;
            if (anchor.textContent.trim().toLowerCase() === 'sair') {
                return anchor;
            }
        }
        return null;
    }

    function getCurrentSelectedFileName(ctx) {
        if (!ctx) return '';
        if (ctx.fileInput && ctx.fileInput.files && ctx.fileInput.files[0]) {
            return ctx.fileInput.files[0].name || '';
        }
        if (ctx.fileNameInput && typeof ctx.fileNameInput.value === 'string') {
            return ctx.fileNameInput.value.trim();
        }
        return '';
    }

    // -------------------------------------------------------------------------
    // Preenchimento compatível com React (controlled inputs)
    // -------------------------------------------------------------------------

    function setReactInputValue(input, value) {
        if (!input) return;
        const previousValue = input.value;
        const proto = typeof HTMLInputElement !== 'undefined'
            ? HTMLInputElement.prototype
            : Object.getPrototypeOf(input);
        const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;

        if (descriptor && typeof descriptor.set === 'function') {
            descriptor.set.call(input, value);
        } else {
            input.value = value;
        }

        if (input._valueTracker && typeof input._valueTracker.setValue === 'function') {
            input._valueTracker.setValue(previousValue);
        }

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function applyAutoFill(fileName, { updateTitle = true } = {}) {
        const ctx = getInsertImageContext();
        if (!ctx || !fileName) return;

        if (updateTitle) {
            let titleValue = stripFileExtension(fileName);
            const titleMax = ctx.tituloInput.maxLength;
            if (typeof titleMax === 'number' && titleMax > 0 && titleValue.length > titleMax) {
                titleValue = titleValue.slice(0, titleMax);
            }
            setReactInputValue(ctx.tituloInput, titleValue);
        }

        const basePath = getSavedBasePath();
        if (!basePath) {
            triggerWarningMsg = 'Base Path não configurado. Clique para definir.';
            updateTriggerAppearance();
            setPopoverStatus('Defina um Base Path para preencher o campo Caminho.', 'warning');
            return;
        }

        const fullPath = buildQuotedFullPath(basePath, fileName);
        const pathMax = ctx.caminhoInput.maxLength;
        if (typeof pathMax === 'number' && pathMax > 0 && fullPath.length > pathMax) {
            triggerWarningMsg = `Caminho excede o limite de ${pathMax} caracteres (${fullPath.length}).`;
            updateTriggerAppearance();
            setPopoverStatus(
                `Atenção: o caminho montado possui ${fullPath.length} caracteres (limite: ${pathMax}).`,
                'warning'
            );
            return;
        }

        triggerWarningMsg = '';
        setReactInputValue(ctx.caminhoInput, fullPath);
        updateTriggerAppearance();
    }

    // -------------------------------------------------------------------------
    // UI e Popover (Mind Light Style + viewport-aware-dropdowns)
    // -------------------------------------------------------------------------

    function injectStyles() {
        if (stylesInjected) return;
        stylesInjected = true;

        GM_addStyle(`
            *:has(> #${TRIGGER_ID}) {
                display: inline-flex !important;
                align-items: center !important;
                gap: 8px !important;
            }

            #${TRIGGER_ID} {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                height: 28px;
                padding: 0 10px;
                border: 1px solid #dee2e6;
                border-radius: 6px;
                background-color: #ffffff;
                color: #37352f;
                font-family: 'Roboto', sans-serif;
                font-size: 12px;
                font-weight: 500;
                line-height: 1;
                cursor: pointer;
                white-space: nowrap;
                transition: background-color 120ms ease, border-color 120ms ease;
            }

            #${TRIGGER_ID}:hover {
                background-color: #f1f3f5;
                border-color: #ced4da;
            }

            #${TRIGGER_ID}:focus-visible {
                outline: 2px solid #1971c2;
                outline-offset: 2px;
            }

            #${TRIGGER_ID} .sbp-dot {
                width: 7px;
                height: 7px;
                border-radius: 999px;
                background-color: #adb5bd;
                flex-shrink: 0;
            }

            #${TRIGGER_ID}.sbp-configured .sbp-dot {
                background-color: #2b8a3e;
            }

            #${TRIGGER_ID}.sbp-needs-path .sbp-dot {
                background-color: #e67700;
            }

            #${TRIGGER_ID}.sbp-needs-path {
                border-color: #f08c00;
                background-color: #fff9db;
                color: #37352f;
            }

            #${TRIGGER_ID} .sbp-caret {
                font-size: 10px;
                color: #868e96;
                margin-left: 1px;
            }

            #${POPOVER_ID} {
                width: 390px;
                max-width: calc(100vw - 16px);
                padding: 14px;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                background-color: #ffffff;
                color: #37352f;
                font-family: 'Roboto', sans-serif;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
                z-index: 999999;
                box-sizing: border-box;
                text-align: left;
            }

            @supports (position-area: block-end) {
                #${POPOVER_ID} {
                    inset: auto;
                    margin: 6px 0 0 0;
                    position-area: block-end span-inline-start;
                    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
                }
            }

            @supports not selector(:popover-open) {
                #${POPOVER_ID}:not(.sbp-fallback-open) {
                    display: none;
                }
            }

            #${POPOVER_ID}:is(:popover-open, .sbp-fallback-open) {
                display: block;
            }

            #${POPOVER_ID} .sbp-header {
                margin-bottom: 10px;
            }

            #${POPOVER_ID} .sbp-title {
                font-size: 13px;
                font-weight: 600;
                color: #212529;
                margin: 0 0 2px 0;
                line-height: 1.3;
            }

            #${POPOVER_ID} .sbp-subtitle {
                font-size: 12px;
                color: #868e96;
                margin: 0;
                line-height: 1.35;
            }

            #${INPUT_ID} {
                width: 100%;
                height: 34px;
                padding: 0 10px;
                border: 1px solid #dee2e6;
                border-radius: 6px;
                background-color: #f8f9fa;
                color: #212529;
                font-size: 12.5px;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                box-sizing: border-box;
            }

            #${INPUT_ID}:focus {
                background-color: #ffffff;
                border-color: #1971c2;
                outline: none;
            }

            #${PREVIEW_ID} {
                margin-top: 8px;
                padding: 7px 9px;
                border-radius: 6px;
                background-color: #f8f9fa;
                border: 1px solid #e9ecef;
                font-size: 11.5px;
                line-height: 1.4;
                color: #53565A;
                word-break: break-all;
            }

            #${PREVIEW_ID} strong {
                color: #37352f;
                font-weight: 600;
            }

            #${POPOVER_ID} .sbp-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 10px;
            }

            #${SAVE_BTN_ID},
            #${CLEAR_BTN_ID} {
                height: 30px;
                padding: 0 12px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                line-height: 1;
                transition: background-color 120ms ease;
            }

            #${SAVE_BTN_ID} {
                border: 1px solid #1971c2;
                background-color: #1971c2;
                color: #ffffff;
            }

            #${SAVE_BTN_ID}:hover {
                background-color: #1864ab;
                border-color: #1864ab;
            }

            #${CLEAR_BTN_ID} {
                border: 1px solid #dee2e6;
                background-color: #f1f3f5;
                color: #495057;
            }

            #${CLEAR_BTN_ID}:hover {
                background-color: #e9ecef;
            }

            #${STATUS_ID} {
                margin-top: 8px;
                font-size: 11.5px;
                line-height: 1.35;
                min-height: 16px;
                color: #868e96;
            }

            #${STATUS_ID}.sbp-status-ok {
                color: #2b8a3e;
            }

            #${STATUS_ID}.sbp-status-warn {
                color: #e67700;
            }

            #${HISTORY_ID} {
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid #e9ecef;
            }

            #${HISTORY_ID}[hidden] {
                display: none;
            }

            #${HISTORY_ID} .sbp-history-label {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                color: #868e96;
                margin-bottom: 6px;
            }

            #${HISTORY_ID} .sbp-history-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            #${HISTORY_ID} .sbp-history-row {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            #${HISTORY_ID} .sbp-history-item {
                flex: 1;
                min-width: 0;
                text-align: left;
                padding: 5px 8px;
                border: 1px solid #e9ecef;
                border-radius: 6px;
                background-color: #ffffff;
                color: #37352f;
                font-size: 11.5px;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                cursor: pointer;
            }

            #${HISTORY_ID} .sbp-history-item:hover {
                background-color: #f1f3f5;
            }

            #${HISTORY_ID} .sbp-history-item.sbp-active {
                background-color: #e7f5ff;
                border-color: #a5d8ff;
                color: #1971c2;
                font-weight: 500;
            }

            #${HISTORY_ID} .sbp-history-remove {
                width: 24px;
                height: 24px;
                flex-shrink: 0;
                border: 1px solid transparent;
                border-radius: 6px;
                background: transparent;
                color: #868e96;
                font-size: 14px;
                line-height: 1;
                cursor: pointer;
            }

            #${HISTORY_ID} .sbp-history-remove:hover {
                background-color: #f1f3f5;
                color: #495057;
            }
        `);
    }

    function ensurePopoverElement() {
        let popover = document.getElementById(POPOVER_ID);
        if (popover) return popover;

        popover = document.createElement('div');
        popover.id = POPOVER_ID;
        popover.setAttribute('popover', 'auto');

        popover.innerHTML = `
            <div class="sbp-header">
                <p class="sbp-title">Base Path das Imagens</p>
                <p class="sbp-subtitle">Preenche Título e Caminho ao selecionar imagem.</p>
            </div>
            <input
                id="${INPUT_ID}"
                type="text"
                placeholder="Ex: C:\\caminho\\das\\imagens"
                autocomplete="off"
                spellcheck="false"
            />
            <div id="${PREVIEW_ID}"></div>
            <div class="sbp-actions">
                <button id="${SAVE_BTN_ID}" type="button">Salvar</button>
                <button id="${CLEAR_BTN_ID}" type="button">Limpar</button>
            </div>
            <div id="${STATUS_ID}"></div>
            <div id="${HISTORY_ID}" hidden>
                <div class="sbp-history-label">Recentes</div>
                <div class="sbp-history-list"></div>
            </div>
        `;

        document.body.appendChild(popover);
        bindPopoverEvents(popover);
        return popover;
    }

    function bindPopoverEvents(popover) {
        const input = popover.querySelector(`#${INPUT_ID}`);
        const saveBtn = popover.querySelector(`#${SAVE_BTN_ID}`);
        const clearBtn = popover.querySelector(`#${CLEAR_BTN_ID}`);

        input.addEventListener('input', () => {
            updatePreview(input.value);
            setPopoverStatus('', 'neutral');
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveAction(input.value);
            }
        });

        saveBtn.addEventListener('click', () => {
            handleSaveAction(input.value);
        });

        clearBtn.addEventListener('click', () => {
            clearBasePath();
            input.value = '';
            updatePreview('');
            renderHistoryList();
            updateTriggerAppearance();
            setPopoverStatus('Base Path removido.', 'neutral');
            input.focus();
        });

        if (supportsNativePopover) {
            popover.addEventListener('toggle', (e) => {
                if (e.newState === 'open') {
                    onPopoverOpened();
                }
            });
        }

        window.addEventListener('resize', () => {
            if (isPopoverOpen()) {
                positionPopoverFallback();
            }
        });

        if (!supportsNativePopover) {
            document.addEventListener('click', (e) => {
                if (!fallbackOpen) return;
                const trigger = document.getElementById(TRIGGER_ID);
                if (popover.contains(e.target) || (trigger && trigger.contains(e.target))) {
                    return;
                }
                closePopover();
            });

            document.addEventListener('keydown', (e) => {
                if (fallbackOpen && e.key === 'Escape') {
                    closePopover();
                }
            });
        }
    }

    function handleSaveAction(rawValue) {
        const clean = saveBasePath(rawValue);
        const input = document.getElementById(INPUT_ID);
        if (input) {
            input.value = clean;
        }
        updatePreview(clean);
        renderHistoryList();
        updateTriggerAppearance();

        if (!clean) {
            setPopoverStatus('Base Path vazio — preenchimento de Caminho desativado.', 'neutral');
            return;
        }

        setPopoverStatus('Base Path salvo e pronto para uso.', 'ok');

        const ctx = getInsertImageContext();
        const currentFileName = getCurrentSelectedFileName(ctx);
        if (ctx && currentFileName) {
            applyAutoFill(currentFileName, {
                updateTitle: !ctx.tituloInput.value.trim()
            });
        }
    }

    function onPopoverOpened() {
        const saved = getSavedBasePath();
        const input = document.getElementById(INPUT_ID);
        if (input) {
            input.value = saved;
        }
        updatePreview(saved);
        renderHistoryList();

        if (triggerWarningMsg) {
            setPopoverStatus(triggerWarningMsg, 'warn');
        } else {
            setPopoverStatus('', 'neutral');
        }

        positionPopoverFallback();

        if (input) {
            setTimeout(() => {
                input.focus();
                input.select();
            }, 0);
        }
    }

    function isPopoverOpen() {
        const popover = document.getElementById(POPOVER_ID);
        if (!popover) return false;
        if (supportsNativePopover) {
            try {
                return popover.matches(':popover-open');
            } catch (err) {
                return false;
            }
        }
        return fallbackOpen;
    }

    function openPopover() {
        const popover = ensurePopoverElement();
        if (supportsNativePopover) {
            if (!isPopoverOpen() && typeof popover.showPopover === 'function') {
                popover.showPopover();
            }
        } else {
            fallbackOpen = true;
            popover.classList.add('sbp-fallback-open');
            onPopoverOpened();
        }
    }

    function closePopover() {
        const popover = document.getElementById(POPOVER_ID);
        if (!popover) return;
        if (supportsNativePopover) {
            if (isPopoverOpen() && typeof popover.hidePopover === 'function') {
                popover.hidePopover();
            }
        } else if (fallbackOpen) {
            fallbackOpen = false;
            popover.classList.remove('sbp-fallback-open');
        }
    }

    function positionPopoverFallback() {
        if (supportsAnchorPositioning) return;

        const popover = document.getElementById(POPOVER_ID);
        const trigger = document.getElementById(TRIGGER_ID);
        if (!popover || !trigger) return;

        const rect = trigger.getBoundingClientRect();
        const panelWidth = popover.offsetWidth || 390;
        const panelHeight = popover.offsetHeight || 220;
        const margin = 8;

        let top = rect.bottom + 6;
        if (top + panelHeight > window.innerHeight - margin) {
            top = Math.max(margin, rect.top - panelHeight - 6);
        }

        const left = Math.max(
            margin,
            Math.min(window.innerWidth - panelWidth - margin, rect.right - panelWidth)
        );

        popover.style.position = 'fixed';
        popover.style.inset = 'auto';
        popover.style.margin = '0';
        popover.style.top = `${Math.round(top)}px`;
        popover.style.left = `${Math.round(left)}px`;
    }

    function updatePreview(rawBasePath) {
        const preview = document.getElementById(PREVIEW_ID);
        if (!preview) return;

        const ctx = getInsertImageContext();
        const sampleFile = getCurrentSelectedFileName(ctx) || 'exemplo.png';
        const fullPath = buildQuotedFullPath(rawBasePath, sampleFile);

        preview.textContent = '';
        const label = document.createElement('strong');
        label.textContent = 'Prévia: ';
        preview.appendChild(label);

        const valueNode = document.createTextNode(
            fullPath || 'Informe um diretório raiz acima (ex: C:\\imagens)'
        );
        preview.appendChild(valueNode);
    }

    function setPopoverStatus(message, tone = 'neutral') {
        const statusEl = document.getElementById(STATUS_ID);
        if (!statusEl) return;

        statusEl.textContent = message || '';
        statusEl.classList.remove('sbp-status-ok', 'sbp-status-warn');
        if (tone === 'ok') {
            statusEl.classList.add('sbp-status-ok');
        } else if (tone === 'warning' || tone === 'warn') {
            statusEl.classList.add('sbp-status-warn');
        }
    }

    function renderHistoryList() {
        const historySection = document.getElementById(HISTORY_ID);
        if (!historySection) return;

        const listEl = historySection.querySelector('.sbp-history-list');
        if (!listEl) return;

        const items = getSavedHistory();
        const current = getSavedBasePath();
        listEl.textContent = '';

        if (items.length === 0) {
            historySection.hidden = true;
            return;
        }

        historySection.hidden = false;

        for (const pathItem of items) {
            const row = document.createElement('div');
            row.className = 'sbp-history-row';

            const selectBtn = document.createElement('button');
            selectBtn.type = 'button';
            selectBtn.className = 'sbp-history-item';
            if (pathItem === current) {
                selectBtn.classList.add('sbp-active');
            }
            selectBtn.textContent = pathItem;
            selectBtn.title = pathItem;
            selectBtn.addEventListener('click', () => {
                handleSaveAction(pathItem);
            });

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'sbp-history-remove';
            removeBtn.textContent = '×';
            removeBtn.title = 'Remover do histórico';
            removeBtn.setAttribute('aria-label', `Remover ${pathItem} do histórico`);
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasCurrent = getSavedBasePath() === pathItem;
                removeHistoryItem(pathItem);
                if (wasCurrent) {
                    const input = document.getElementById(INPUT_ID);
                    if (input) input.value = '';
                    updatePreview('');
                }
                renderHistoryList();
                updateTriggerAppearance();
            });

            row.appendChild(selectBtn);
            row.appendChild(removeBtn);
            listEl.appendChild(row);
        }
    }

    function createTriggerButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = TRIGGER_ID;
        btn.setAttribute('popovertarget', POPOVER_ID);

        const dot = document.createElement('span');
        dot.className = 'sbp-dot';
        dot.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'sbp-label';
        label.textContent = 'Base Path';

        const caret = document.createElement('span');
        caret.className = 'sbp-caret';
        caret.setAttribute('aria-hidden', 'true');
        caret.textContent = '▾';

        btn.appendChild(dot);
        btn.appendChild(label);
        btn.appendChild(caret);

        if (!supportsNativePopover) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isPopoverOpen()) {
                    closePopover();
                } else {
                    openPopover();
                }
            });
        }

        return btn;
    }

    function updateTriggerAppearance() {
        const trigger = document.getElementById(TRIGGER_ID);
        if (!trigger) return;

        const saved = getSavedBasePath();
        trigger.classList.remove('sbp-configured', 'sbp-needs-path');

        if (triggerWarningMsg) {
            trigger.classList.add('sbp-needs-path');
            trigger.title = triggerWarningMsg;
        } else if (saved) {
            trigger.classList.add('sbp-configured');
            trigger.title = `Base Path ativo: ${saved}`;
        } else {
            trigger.title = 'Definir Base Path para preenchimento automático';
        }
    }

    function removeTriggerIfPresent() {
        const existing = document.getElementById(TRIGGER_ID);
        if (existing && existing.parentElement) {
            existing.parentElement.removeChild(existing);
        }
    }

    // -------------------------------------------------------------------------
    // Sincronização SPA e observação do DOM
    // -------------------------------------------------------------------------

    function syncUI() {
        syncScheduled = false;

        const ctx = getInsertImageContext();
        const logoutAnchor = ctx ? findLogoutAnchor() : null;

        if (!ctx || !logoutAnchor || !logoutAnchor.parentElement) {
            closePopover();
            removeTriggerIfPresent();
            return;
        }

        injectStyles();
        ensurePopoverElement();

        let trigger = document.getElementById(TRIGGER_ID);
        if (!trigger) {
            trigger = createTriggerButton();
        }

        const parent = logoutAnchor.parentElement;
        if (trigger.parentElement !== parent || trigger.nextElementSibling !== logoutAnchor) {
            parent.insertBefore(trigger, logoutAnchor);
        }

        updateTriggerAppearance();
    }

    function scheduleSync() {
        if (syncScheduled) return;
        syncScheduled = true;
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(syncUI);
        } else {
            setTimeout(syncUI, 0);
        }
    }

    function isOwnUiNode(node) {
        if (!node || node.nodeType !== 1) return false;
        const el = node;
        if (el.id === TRIGGER_ID || el.id === POPOVER_ID) return true;
        if (typeof el.closest === 'function') {
            return Boolean(el.closest(`#${TRIGGER_ID}, #${POPOVER_ID}`));
        }
        return false;
    }

    function installListeners() {
        document.addEventListener('change', (event) => {
            const target = event.target;
            if (!target || target.tagName !== 'INPUT' || target.type !== 'file') return;

            const ctx = getInsertImageContext();
            if (!ctx || ctx.fileInput !== target) return;

            const file = target.files && target.files[0];
            if (!file) return;

            setTimeout(() => {
                applyAutoFill(file.name, { updateTitle: true });
            }, 0);
        });

        const observeTarget = document.getElementById('root') || document.body;
        if (observeTarget && typeof MutationObserver === 'function') {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (isOwnUiNode(mutation.target)) continue;
                    scheduleSync();
                    break;
                }
            });
            observer.observe(observeTarget, { childList: true, subtree: true });
        }

        window.addEventListener('popstate', scheduleSync);
        window.addEventListener('hashchange', scheduleSync);

        if (window.history) {
            const originalPushState = window.history.pushState;
            const originalReplaceState = window.history.replaceState;

            if (typeof originalPushState === 'function') {
                window.history.pushState = function (...args) {
                    const result = originalPushState.apply(this, args);
                    scheduleSync();
                    return result;
                };
            }

            if (typeof originalReplaceState === 'function') {
                window.history.replaceState = function (...args) {
                    const result = originalReplaceState.apply(this, args);
                    scheduleSync();
                    return result;
                };
            }
        }
    }

    if (window.__SECULLUM_BP_TEST__) {
        window.__SECULLUM_BP_TEST__.api = {
            sanitizeBasePath,
            detectSeparator,
            stripFileExtension,
            buildQuotedFullPath,
            isAdminRootRoute,
            getInsertImageContext,
            findLogoutAnchor,
            getSavedBasePath,
            getSavedHistory,
            saveBasePath,
            clearBasePath,
            removeHistoryItem,
            setReactInputValue,
            applyAutoFill,
            syncUI,
            handleSaveAction,
            openPopover,
            closePopover
        };
    }

    installListeners();
    syncUI();
})();
