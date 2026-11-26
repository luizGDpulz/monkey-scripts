// ==UserScript==
// @name AdBlock Secullum Ponto Web
// @namespace local.secullum
// @version 3.5
// @author Luiz Gustavo Dias Pulz
// @description Fecha automaticamente popups do sistema
//
// @match https://pontoweb.secullum.com.br/*
// @updateURL https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/adblock-secullum-ponto-web.user.js
// @downloadURL https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/adblock-secullum-ponto-web.user.js
//
// @run-at document-end
// @grant none
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG = true;
    let ultimoAcionamento = 0;
    const COOLDOWN = 50; // Reduzido de 800 para 50 para executar bem mais rápido

    //--------------------------------------------------
    // Utils
    //--------------------------------------------------

    function log(...args) {
        if (DEBUG) {
            console.log("[SECULLUM AUTO]", ...args);
        }
    }

    function podeExecutar() {
        const agora = Date.now();
        if (agora - ultimoAcionamento < COOLDOWN) { return false; }
        ultimoAcionamento = agora;
        return true;
    }

    function click(el, nome = "Elemento") {
        if (!el) return false;
        if (!podeExecutar()) return false;
        log("Clique:", nome);
        el.click();
        return true;
    }

    function marcarCheckbox(checkbox, nome = "Checkbox") {
        if (!checkbox) return false;
        if (checkbox.checked) return false;
        if (!podeExecutar()) return false;
        log("Marcando:", nome);
        checkbox.click();
        // força atualização React
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        checkbox.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    }

    // Função auxiliar para verificar visibilidade
    function isVisivel(el) {
        return el && (el.offsetWidth > 0 || el.offsetHeight > 0);
    }

    //--------------------------------------------------
    // Handlers específicos
    //--------------------------------------------------

    // 1) Termo LGPD - Aceite (Termo de Responsabilidade)
    function handleLGPDAceite() {
        const modais = document.querySelectorAll("#Termo-Responsabilidade");
        for (const modal of modais) {
            if (!isVisivel(modal)) continue;

            const container = modal.closest(".ReactModal__Content, .ReactModalContent, .form-modal") || modal;
            const checkbox = container.querySelector("#concordaTermosUsoLGPD");
            const botao = container.querySelector("#btnSalvarOpcoes");

            if (checkbox && !checkbox.checked) {
                return marcarCheckbox(checkbox, "Aceite LGPD (Termo Responsabilidade)");
            }
            if (botao && !botao.disabled) {
                return click(botao, "Concluir LGPD (Termo Responsabilidade)");
            }
        }
        return false;
    }

    // 2) Termo LGPD - Aviso genérico
    function handleLGPDAviso() {
        const avisos = document.querySelectorAll(".div-aceite-lgpd");
        for (const aviso of avisos) {
            if (!isVisivel(aviso)) continue;

            // Se essa div faz parte do Termo-Responsabilidade, já foi tratada pelo handler acima
            if (aviso.closest("#Termo-Responsabilidade")) continue;

            const container = aviso.closest(".ReactModal__Content, .ReactModalContent, .form-modal") || aviso.parentElement;
            const btnFechar = container.querySelector("#btnFecharModal, #fechar");

            if (btnFechar) {
                return click(btnFechar, "Fechar Aviso Genérico LGPD");
            }
        }
        return false;
    }

    // 2) Portaria 671
    function handlePortaria671() {
        const modais = document.querySelectorAll(".modal-portaria-671");
        for (const modal of modais) {
            if (!isVisivel(modal)) continue;

            const container = modal.closest(".ReactModal__Content, .ReactModalContent, .form-modal") || modal.parentElement.parentElement;
            const checkbox = container.querySelector("#naoExibirNovamente");
            const botao = container.querySelector("#modal-portaria-671-ok");

            if (checkbox && !checkbox.checked) {
                return marcarCheckbox(checkbox, "Não exibir Portaria 671");
            }
            if (botao) {
                return click(botao, "OK Portaria 671");
            }
        }
        return false;
    }

    // 3) Aviso de Live / Banner normal
    function handleAvisoBanner() {
        const avisos = document.querySelectorAll(".aviso-banco-personalizado");
        for (const aviso of avisos) {
            if (!isVisivel(aviso)) continue;

            const container = aviso.closest(".ReactModal__Content, .ReactModalContent, .form-modal") || aviso.parentElement;
            const btnFechar = container.querySelector("#fechar, #btnFecharModal");
            if (btnFechar) {
                return click(btnFechar, "Fechar aviso de Live");
            }
        }
        return false;
    }

    // 4) Popup limite de pessoas (atingido ou próximo)
    function handleLimitePessoas() {
        const msgBoxes = document.querySelectorAll(".msgbox-exclamation, .msgbox-information");
        for (const msgBox of msgBoxes) {
            if (!isVisivel(msgBox)) continue;

            const text = msgBox.textContent.toLowerCase();
            const limiteAtingido = text.includes("limite de") && text.includes("funcionários cadastrados foi atingido");
            const limiteProximo = text.includes("limite de pessoas está próximo");

            if (limiteAtingido || limiteProximo) {
                const container = msgBox.closest(".ReactModal__Content, .ReactModalContent, .form-modal") || msgBox.parentElement;
                const btnOk = container.querySelector("#btnOk, .msgbox-button");
                if (btnOk) {
                    return click(btnOk, "Popup limite pessoas OK");
                }
            }
        }
        return false;
    }

    // 5) Aviso Serviço em demonstração
    function handleDemonstracao() {
        const avisos = document.querySelectorAll(".aviso-validade-banco");
        for (const aviso of avisos) {
            if (!isVisivel(aviso)) continue;

            const container = aviso.closest(".ReactModal__Content, .ReactModalContent, .form-modal") || aviso.parentElement;
            const btnFechar = container.querySelector("#fechar, #btnFecharModal");
            if (btnFechar) {
                return click(btnFechar, "Fechar aviso de demonstração");
            }
        }
        return false;
    }

    // 6) Aviso de Revenda
    function handleAvisoRevenda() {
        const avisos = document.querySelectorAll(".aviso-banco-padrao");
        for (const aviso of avisos) {
            if (!isVisivel(aviso)) continue;

            const container = aviso.closest(".ReactModal__Content, .ReactModalContent, .form-modal") || aviso.parentElement;
            const btnFechar = container.querySelector("#fechar, #btnFecharModal");
            if (btnFechar) {
                return click(btnFechar, "Fechar aviso de revenda");
            }
        }
        return false;
    }

    //--------------------------------------------------
    // Pipeline principal
    //--------------------------------------------------

    const handlers = [
        handleLGPDAceite,
        handleLGPDAviso,
        handlePortaria671,
        handleAvisoBanner,
        handleLimitePessoas,
        handleDemonstracao,
        handleAvisoRevenda
    ];

    function executar() {
        for (const handler of handlers) {
            if (handler()) {
                return;
            }
        }
    }

    //--------------------------------------------------
    // Inicialização
    //--------------------------------------------------

    // primeira tentativa
    setTimeout(executar, 50);

    // observa mudanças (React)
    const observer = new MutationObserver(() => {
        executar();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // backup periódico
    setInterval(executar, 500);

    log("Script iniciado com verificações rigorosas");

})();
