// ==UserScript==
// @name         Secullum - Gerador de documentos e cadastros de teste
// @namespace    local.secullum.testes
// @version      1.2.0
// @description  Gera CPF, PIS e CNPJ com DV correto e preenche cadastros de teste. Alt+Shift+G oculta/exibe todos os controles.
// @match        https://pontoweb.secullum.com.br/*
// @updateURL    https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/gerador-documentos-cadastros-teste.user.js
// @downloadURL  https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/gerador-documentos-cadastros-teste.user.js
// @run-at       document-end
// @grant        none
// @author       Tymótheo Trisch
// ==/UserScript==

(function () {
    'use strict';

    // Dados fictícios para testes. DV correto não comprova inscrição real.
    // Este script preenche campos; o salvamento continua manual.
    const PREFIX = 'secullum-test-data';
    if (document.getElementById(PREFIX)) return;
    let enabled = true;
    const allowedRoute = () => /^#\/(?:funcionarios-dados|empresas-dados)(?:\/|\?|$)/.test(location.hash);
    let hidden = false;
    let busy = false;
    let scheduled = false;
    const controls = new Map();
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const normal = text => String(text || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const visible = el => !!el && el.isConnected && el.getClientRects().length > 0 &&
        getComputedStyle(el).visibility !== 'hidden';
    const editable = el => !!el && !el.disabled && !el.readOnly && el.type !== 'hidden';
    const byId = (root, id) => Array.from(root.querySelectorAll('[id]'))
        .find(el => el.id === id && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.type !== 'hidden');
    const random = (min, max) => {
        const sample = new Uint32Array(1);
        crypto.getRandomValues(sample);
        return min + sample[0] % (max - min + 1);
    };
    const digits = n => Array.from({ length: n }, () => random(0, 9)).join('');
    const choose = values => values[random(0, values.length - 1)];

    function dv(value, weights) {
        const remainder = [...value].reduce((sum, digit, index) =>
            sum + Number(digit) * weights[index], 0) % 11;
        return remainder < 2 ? '0' : String(11 - remainder);
    }

    function generate(type) {
        let base;
        if (type === 'CPF') {
            do { base = digits(9); } while (/^(\d)\1+$/.test(base));
            base += dv(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
            return base + dv(base, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
        }
        if (type === 'PIS') {
            base = choose(['1', '2']) + digits(9);
            return base + dv(base, [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        }
        if (type === 'CNPJ') {
            base = String(random(10000000, 99999999)) + '0001';
            base += dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
            return base + dv(base, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        }
        throw new Error('Tipo de documento não reconhecido.');
    }

    function format(value, type) {
        if (type === 'CPF') return value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
        if (type === 'CNPJ') return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
        return value;
    }

    // Usa o setter nativo para o React reconhecer a alteração do campo.
    function setValue(el, value) {
        if (!editable(el)) return false;
        if (visible(el)) el.focus({ preventScroll: true });
        let text = String(value);
        if (el.maxLength > 0) text = text.slice(0, el.maxLength);
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
            el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (document.activeElement === el) el.blur();
        else {
            el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
            el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        }
        return true;
    }

    function documentType(input) {
        if (!editable(input) || !['text', 'tel', 'number', ''].includes(input.type)) return null;
        const key = normal(input.id + ' ' + input.name);
        const labels = Array.from(input.labels || []).map(label => label.textContent).join(' ');
        const text = normal(key + ' ' + labels + ' ' + (input.placeholder || '') + ' ' + (input.getAttribute('aria-label') || ''));
        if (input.id === 'Documento' || normal(input.name) === 'documento') {
            const root = input.closest('.panel-body, .form-modal, form') || document;
            const typeControl = root.querySelector('#TipoDocumento');
            const typeText = normal(typeControl?.querySelector('.Select-value-label')?.textContent || typeControl?.textContent);
            if (/cnpj/.test(typeText)) return 'CNPJ';
            if (/cpf/.test(typeText)) return 'CPF';
            return null; // CEI/CAEPF e outros tipos não recebem CPF/CNPJ.
        }
        if (/cnpj/.test(text) && /cpf/.test(text)) {
            const length = input.value.replace(/\D/g, '').length;
            return length === 14 ? 'CNPJ' : length === 11 ? 'CPF' : 'AMBOS';
        }
        if (/cnpj/.test(text)) return 'CNPJ';
        if (/cpf/.test(text)) return 'CPF';
        if (/pis|pasep|numeronis|numero_nis/.test(text) || /\bnis\b/.test(text)) return 'PIS';
        return null;
    }

    function fillDocument(input, type) {
        const value = generate(type);
        const max = input.maxLength;
        const formatted = input.type !== 'number' && (max < 0 || max >= (type === 'CPF' ? 14 : 18));
        setValue(input, formatted ? format(value, type) : value);
    }

    const style = document.createElement('style');
    style.textContent = `
        #${PREFIX}, #${PREFIX}-layer { font: 12px/1.4 Arial,sans-serif; color: #344a61; }
        #${PREFIX} { position: fixed; z-index: 2147483646; box-sizing: border-box; }
        #${PREFIX}[hidden], #${PREFIX}-layer[hidden] { display: none !important; }
        #${PREFIX} [data-action="menu"] { min-width: 160px; display: flex;
            align-items: center; justify-content: space-between; gap: 18px; height: 30px; }
        #${PREFIX}-menu { display: none; position: absolute; right: 0; top: calc(100% + 4px);
            width: min(290px, calc(100vw - 24px)); padding: 6px; box-sizing: border-box;
            background: #fff; border: 1px solid #cccdd4; box-shadow: 0 4px 12px #0002; }
        #${PREFIX}.menu-open #${PREFIX}-menu { display: grid; gap: 4px; }
        #${PREFIX}-menu > button { width: 100%; text-align: left; }
        #${PREFIX} button, #${PREFIX}-layer button { font: 12px Arial,sans-serif; cursor: pointer;
            border: 1px solid #bfc1ca; border-radius: 0; padding: 8px 12px;
            color: #344a61; background: #fff; box-sizing: border-box; }
        #${PREFIX} button:hover, #${PREFIX}-layer button:hover { background: #eceef1; }
        #${PREFIX} button[data-action="fill"], #${PREFIX}-layer button { background: #ffcc00; color: #343a40; }
        #${PREFIX} button[data-action="fill"]:hover, #${PREFIX}-layer button:hover { background: #eab900; }
        #${PREFIX} button:focus-visible, #${PREFIX}-layer button:focus-visible { outline: 2px solid #344a61; outline-offset: 2px; }
        #${PREFIX} button:disabled { opacity: .5; cursor: wait; }
        #${PREFIX} label { display: flex; align-items: center; gap: 8px; margin: 0; padding: 8px 6px; color: #344a61; }
        #${PREFIX} input { width: auto; margin: 0; accent-color: #ffcc00; }
        #${PREFIX} strong { font-size: 12px; font-weight: normal; }
        #${PREFIX} small { color: #656a71; padding: 5px 6px; }
        #${PREFIX}-status { display: block; padding: 8px 6px; border-top: 1px solid #e3e4e8; overflow-wrap: anywhere; }
        #${PREFIX}-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483645; }
        #${PREFIX}-layer button { position: absolute; pointer-events: auto; padding: 0 8px; }
        html.${PREFIX}-hidden #${PREFIX}, html.${PREFIX}-hidden #${PREFIX}-layer { display: none !important; }
        html.${PREFIX}-active #sugerir-pis { margin-left: calc(var(--${PREFIX}-pis-space, 0px) + 12px) !important; }
        @media print { #${PREFIX}, #${PREFIX}-layer { display: none !important; } }
    `;
    document.head.append(style);
    const widget = document.createElement('div');
    widget.id = PREFIX;
    widget.hidden = true;
    widget.setAttribute('role', 'region');
    widget.setAttribute('aria-label', 'Gerador de cadastros de teste');
    widget.innerHTML = `
        <button type="button" data-action="menu" aria-expanded="false" aria-controls="${PREFIX}-menu"><strong>Configurações</strong><span aria-hidden="true">▾</span></button>
        <div id="${PREFIX}-menu" aria-label="Opções de dados de teste">
        <button type="button" data-action="fill">Preencher cadastro</button>
        <label><input type="checkbox" data-action="enabled"> Geradores nos campos</label>
        <label title="Desmarque para preencher somente campos vazios"><input type="checkbox" data-action="replace" checked> Substituir preenchidos</label>
        <button type="button" data-action="hide" title="Restaurar: Alt+Shift+G">Ocultar para print</button>
        <span id="${PREFIX}-status" role="status" aria-live="polite">Documentos com DV correto. Revise antes de salvar.</span>
        <small>Alt+Shift+G: ocultar/exibir</small></div>`;
    const layer = document.createElement('div');
    layer.id = PREFIX + '-layer';
    layer.hidden = true;
    document.body.append(widget, layer);
    const toggle = widget.querySelector('[data-action="enabled"]');
    const replace = widget.querySelector('[data-action="replace"]');
    const fillButton = widget.querySelector('[data-action="fill"]');
    const menuButton = widget.querySelector('[data-action="menu"]');
    const status = widget.querySelector('[role="status"]');
    toggle.checked = enabled;
    const say = message => { status.textContent = message; };
    function setMenu(open) {
        widget.classList.toggle('menu-open', open);
        menuButton.setAttribute('aria-expanded', String(open));
    }
    menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('click', event => { if (!widget.contains(event.target)) setMenu(false); });

    function setHidden(value) {
        hidden = value;
        document.documentElement.classList.toggle(PREFIX + '-hidden', hidden);
        setMenu(false);
        schedule();
    }
    widget.querySelector('[data-action="hide"]').addEventListener('click', () => setHidden(true));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') setMenu(false);
        if (allowedRoute() && event.altKey && event.shiftKey && event.code === 'KeyG' && !event.repeat) {
            event.preventDefault();
            setHidden(!hidden);
        }
    });
    toggle.addEventListener('change', () => {
        enabled = toggle.checked;
        schedule();
    });

    // Os botões ficam em uma camada independente: não envolvem nem movem
    // os inputs controlados pelo React. A posição acompanha o campo.
    function scan() {
        scheduled = false;
        const ctx = allowedRoute() ? context() : null;
        const show = !!ctx && !hidden;
        widget.hidden = !show;
        layer.hidden = !show || !enabled;
        document.documentElement.classList.toggle(PREFIX + '-active', show && enabled);
        if (!show) setMenu(false);
        if (show) {
            const header = ctx.root.closest('.panel')?.querySelector('.panel-header');
            if (header && visible(header)) {
                const rect = header.getBoundingClientRect();
                const width = menuButton.getBoundingClientRect().width;
                const height = menuButton.getBoundingClientRect().height;
                widget.style.left = Math.max(8, Math.min(innerWidth - width - 8, rect.right - width - 10)) + 'px';
                widget.style.top = Math.max(8, rect.top + (rect.height - height) / 2) + 'px';
            } else {
                widget.style.left = Math.max(8, innerWidth - menuButton.getBoundingClientRect().width - 16) + 'px';
                widget.style.top = '64px';
            }
        }
        const activeModal = Array.from(document.querySelectorAll('.ReactModal__Content, .ReactModalContent'))
            .filter(visible).pop();
        const inputs = new Set();
        if (enabled && show) {
            for (const input of ctx.root.querySelectorAll('input')) {
                if (!visible(input) || (activeModal && !activeModal.contains(input))) continue;
                const type = documentType(input);
                if (!type) continue;
                inputs.add(input);
                let record = controls.get(input);
                if (!record || record.type !== type) {
                    if (record) record.buttons.forEach(button => button.remove());
                    const types = type === 'AMBOS' ? ['CPF', 'CNPJ'] : [type];
                    const buttons = types.map(kind => {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.textContent = 'Gerar ' + kind;
                        button.setAttribute('aria-label', 'Gerar ' + kind + ' de teste para ' + (input.id || input.name));
                        button.title = 'Gerar ' + kind + ' com dígitos verificadores corretos';
                        button.addEventListener('mousedown', event => event.preventDefault());
                        button.addEventListener('click', () => {
                            if (!allowedRoute() || hidden || !enabled || !editable(input) || busy) return;
                            // Revalida o tipo caso o seletor da empresa tenha mudado.
                            const current = documentType(input);
                            if (current !== 'AMBOS' && current !== kind) return schedule();
                            fillDocument(input, kind);
                            say(kind + ' de teste gerado. O cadastro ainda não foi salvo.');
                        });
                        layer.append(button);
                        return button;
                    });
                    record = { type, buttons };
                    controls.set(input, record);
                }
                const rect = input.getBoundingClientRect();
                let x = rect.right + 5;
                for (const button of record.buttons) {
                    button.style.display = '';
                    button.style.height = rect.height + 'px';
                    button.style.fontSize = getComputedStyle(input).fontSize;
                    const width = button.getBoundingClientRect().width;
                    // Sem espaço à direita, posiciona acima do campo.
                    const overflow = x + width > innerWidth - 8;
                    button.style.left = Math.max(8, overflow ? rect.right - width : x) + 'px';
                    button.style.top = (overflow ? rect.top - rect.height - 4 : rect.top) + 'px';
                    button.style.display = rect.top < 0 || rect.bottom > innerHeight ? 'none' : '';
                    x += width + 4;
                }
                if (input.id === 'NumeroPis') document.documentElement.style.setProperty('--' + PREFIX + '-pis-space', (x - rect.right) + 'px');
            }
        }
        for (const [input, record] of controls) {
            if (inputs.has(input)) continue;
            record.buttons.forEach(button => button.remove());
            controls.delete(input);
        }
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(scan);
    }

    function context() {
        if (!allowedRoute()) return null;
        const modals = Array.from(document.querySelectorAll('.ReactModal__Content, .ReactModalContent')).filter(visible);
        const roots = modals.length ? [modals[modals.length - 1]] :
            Array.from(document.querySelectorAll('main .panel-body, main form, .panel-body')).filter(visible);
        for (const root of [...new Set(roots)]) {
            if (byId(root, 'NumeroFolha') && byId(root, 'Cpf')) return { root, type: 'funcionario' };
            if (byId(root, 'Documento') && byId(root, 'ResponsavelNome')) return { root, type: 'empresa' };
        }
        return null;
    }

    async function waitFor(fn, timeout = 2500) {
        const end = Date.now() + timeout;
        do {
            const result = fn();
            if (result) return result;
            await sleep(80);
        } while (Date.now() < end);
        return null;
    }

    function selected(root, id) {
        const input = byId(root, id);
        if (input?.tagName === 'SELECT') return !!input.value;
        const select = input?.closest('.Select');
        return !!select?.querySelector('.Select-value-label');
    }

    // Escolhe opções reais pela interface do react-select, nunca inventa IDs.
    async function selectOption(root, id, search = '', exact = false) {
        let input = byId(root, id);
        if (!input || !editable(input)) return false;
        if (!search && selected(root, id)) return true;
        if (input.tagName === 'SELECT') {
            const options = Array.from(input.options).filter(option => option.value && !option.disabled);
            const option = search ? options.find(item => normal(item.textContent).startsWith(normal(search))) : options[0];
            return option ? setValue(input, option.value) : false;
        }
        const select = input.closest('.Select');
        if (!select || select.classList.contains('is-disabled') || !visible(select)) return false;
        if (search && normal(select.querySelector('.Select-value-label')?.textContent).startsWith(normal(search))) return true;
        const control = select.querySelector('.Select-control');
        if (!control) return false;
        input.focus({ preventScroll: true });
        control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
        if (search) {
            // Mantém o foco enquanto digita: o menu precisa ficar aberto.
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, search);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const option = await waitFor(() => {
            if (!root.isConnected) throw new Error('A tela mudou durante o preenchimento.');
            const options = Array.from(select.querySelectorAll('.Select-option, [role="option"]'))
                .filter(el => visible(el) && !el.closest('.Select-value') &&
                    !el.classList.contains('is-disabled') && el.getAttribute('aria-disabled') !== 'true');
            return search ? options.find(el => {
                const text = normal(el.textContent);
                return exact ? text === normal(search) || text.startsWith(normal(search) + ' -') || text.startsWith(normal(search) + '/') :
                    text.includes(normal(search));
            }) : options[0];
        });
        if (option) {
            option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
            if (option.isConnected) option.click();
            await sleep(120);
        }
        input = byId(root, id);
        if (input) {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
            input.blur();
        }
        return selected(root, id);
    }

    function person() {
        return choose(['Ana', 'Bruna', 'Camila', 'Diego', 'Felipe', 'Gabriel', 'Julia', 'Lucas', 'Marina', 'Rafael']) +
            ' ' + choose(['Almeida', 'Costa', 'Ferreira', 'Lima', 'Martins', 'Oliveira', 'Santos', 'Souza']);
    }
    function date(value) {
        return [String(value.getDate()).padStart(2, '0'), String(value.getMonth() + 1).padStart(2, '0'), value.getFullYear()].join('/');
    }
    function admissionDate() {
        // Entre cinco anos atrás e hoje, sem gerar admissão futura.
        const today = new Date();
        const from = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate());
        const days = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
            Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000);
        return date(new Date(from.getFullYear(), from.getMonth(), from.getDate() + random(0, days)));
    }
    function profile(type) {
        const token = Date.now().toString(36) + digits(3);
        const name = person();
        const common = {
            Nome: type === 'empresa' ? 'Empresa Teste ' + token.toUpperCase() + ' LTDA' : name + ' Teste',
            Endereco: choose(['Rua das Flores', 'Rua dos Ipês', 'Avenida das Acácias', 'Rua das Palmeiras', 'Alameda dos Cedros']) + ', ' + random(10, 9999),
            Bairro: choose(['Centro', 'Jardim das Flores', 'Vila Nova', 'Parque das Acácias', 'Bela Vista']),
            Pais: 'Brasil', Telefone: '513000' + digits(4), Celular: '5199' + digits(7)
        };
        if (type === 'empresa') return {
            ...common, Inscricao: 'Isento', NFolhaEmpresa: String(random(1, 9999)),
            Fax: '513000' + digits(4),
            ResponsavelNome: name + ' Teste',
            ResponsavelCargo: choose(['Administrador', 'Gerente', 'Diretor', 'Coordenador de RH', 'Analista de RH']),
            ResponsavelEmail: 'empresa.' + token + '@example.com'
        };
        return {
            ...common, NumeroFolha: String(random(1, 9999)),
            NumeroIdentificador: String(random(1, 9999)),
            Admissao: admissionDate(), Observacao: 'Cadastro fictício gerado para testes.',
            Email: 'funcionario.' + token + '@example.com',
            Pai: person() + ' Teste', Mae: person() + ' Teste',
            Nascimento: date(new Date(random(1975, 2004), random(0, 11), random(1, 28))),
            Nacionalidade: 'Brasileira', Naturalidade: 'Campo Bom'
        };
    }

    async function autocomplete() {
        if (busy || !allowedRoute() || hidden) return;
        const ctx = context();
        if (!ctx) return say('Abra o cadastro de empresa ou funcionário para preencher.');
        busy = true;
        fillButton.disabled = true;
        const overwrite = replace.checked;
        const pending = new Set();
        let count = 0;
        const root = ctx.root;
        const url = location.href;
        const ensureScreen = () => {
            if (!root.isConnected || location.href !== url) throw new Error('A tela mudou. Preenchimento interrompido.');
        };
        const fill = (id, value) => {
            ensureScreen();
            const input = byId(root, id);
            if (!editable(input) || (!overwrite && input.value.trim())) return;
            if (setValue(input, input.type === 'date' ? value.split('/').reverse().join('-') : value)) count++;
        };
        const docs = () => {
            for (const input of root.querySelectorAll('input')) {
                const type = documentType(input);
                if (!type || type === 'AMBOS' || (!overwrite && input.value.trim())) continue;
                fillDocument(input, type);
                count++;
            }
        };
        try {
            say('Preenchendo ' + (ctx.type === 'empresa' ? 'empresa' : 'funcionário') + '…');
            const data = profile(ctx.type);
            for (const [id, value] of Object.entries(data)) fill(id, value);
            docs();
            // Abas já estão montadas no HTML recebido. As listas da aba
            // genérica precisam estar visíveis para abrir seus menus.
            if (ctx.type === 'funcionario') {
                const tab = Array.from(root.querySelectorAll('[role="tab"]'))
                    .find(el => normal(el.textContent).includes('dados gener'));
                if (tab && !tab.classList.contains('active')) { tab.click(); await sleep(150); }
                for (const [id, label] of [['EmpresaId', 'Empresa'], ['HorarioId', 'Horário'],
                    ['FuncaoId', 'Função'], ['DepartamentoId', 'Departamento']]) {
                    ensureScreen();
                    if (!await selectOption(root, id)) pending.add(label);
                }
            }
            ensureScreen();
            if (!selected(root, 'CidadeId')) {
                say('Selecionando cidade…');
                const ok = await selectOption(root, 'CidadeId', 'Campo Bom', true);
                ensureScreen();
                if (ok) {
                    // Endereço fictício; CEP de teste na faixa da cidade.
                    fill('Uf', 'RS');
                    fill('Cep', '93701-000');
                } else pending.add('Cidade');
            }
            const cityInput = byId(root, 'CidadeId');
            const cityName = normal(cityInput?.closest('.Select')?.querySelector('.Select-value-label')?.textContent);
            if (cityName === 'campo bom' || cityName.startsWith('campo bom -') || cityName.startsWith('campo bom/')) {
                // Na empresa, também varia o CEP de teste quando autorizado
                // substituir os dados. A cidade permanece uma opção cadastrada.
                const companyReplace = ctx.type === 'empresa' && overwrite;
                const cep = companyReplace ? '93701-' + String(random(0, 999)).padStart(3, '0') : '93701-000';
                for (const [id, value] of [['Uf', 'RS'], ['Cep', cep]]) {
                    const field = byId(root, id);
                    if (editable(field) && (companyReplace || !field.value.trim()) && setValue(field, value)) count++;
                }
            }
            // Ao manter uma cidade existente, preserva também seu UF/CEP.
            for (const id of ['Uf', 'Cep']) {
                const field = byId(root, id);
                if (field && !field.value.trim()) pending.add(id === 'Uf' ? 'Estado/Distrito' : 'CEP');
            }
            for (const label of root.querySelectorAll('label.required[for]')) {
                const id = label.htmlFor;
                const field = byId(root, id);
                if (!field || field.disabled) continue;
                if (field.closest('.Select') ? !selected(root, id) : !field.value.trim()) {
                    pending.add(label.textContent.trim());
                }
            }
            const unsupportedDoc = byId(root, 'Documento');
            if (ctx.type === 'empresa' && unsupportedDoc && !unsupportedDoc.value.trim()) pending.add('Documento: selecione CPF ou CNPJ');
            say(count + ' campos preenchidos. ' + (pending.size ? 'Complete: ' + [...pending].join(', ') + '. ' : '') +
                'Revise e clique em Salvar no sistema.');
        } catch (error) {
            say('Preenchimento interrompido: ' + error.message);
            console.error('[SECULLUM TESTES]', error);
        } finally {
            busy = false;
            fillButton.disabled = false;
            schedule();
        }
    }

    fillButton.addEventListener('click', autocomplete);
    // Ignora mutações dos próprios controles, evitando ciclos de observação.
    new MutationObserver(records => {
        if (records.some(record => !widget.contains(record.target) && !layer.contains(record.target) &&
            record.target !== document.documentElement &&
            !(record.type === 'childList' && [...record.addedNodes, ...record.removedNodes]
                .every(node => node === widget || node === layer)))) schedule();
    }).observe(document.body, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'disabled', 'readonly', 'placeholder', 'aria-label'] });
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    window.addEventListener('popstate', schedule);
    schedule();
})();
