// ==UserScript==
// @name         Auto Selecionar Tabela de Manutenção de Funcionários
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Seleciona automaticamente X checkboxes em uma tabela virtual a partir de um clique
// @author       Luiz Gustavo Dias Pulz
// @match        https://pontoweb.secullum.com.br/*
// @updateURL    https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/auto-selecionar-tabela-manutencao-funcionarios.user.js
// @downloadURL  https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/auto-selecionar-tabela-manutencao-funcionarios.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 0. DESLIGA A ANCORAGEM DE ROLAGEM (Solução que removeu o erro amarelo)
    const style = document.createElement('style');
    style.innerHTML = `
        .virtual-table-container,
        .virtual-table-body-container,
        .manutencao-funcionarios-tabela-container,
        .virtual-table-body,
        tr, td {
            overflow-anchor: none !important;
            scroll-behavior: auto !important;
        }
    `;
    document.head.appendChild(style);

    // 1. Cria a Interface Flutuante
    const ui = document.createElement('div');
    ui.style.position = 'fixed';
    ui.style.bottom = '20px';
    ui.style.right = '20px';
    ui.style.backgroundColor = '#ffffff';
    ui.style.border = '1px solid #ccc';
    ui.style.padding = '15px';
    ui.style.zIndex = '999999';
    ui.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    ui.style.borderRadius = '8px';
    ui.style.fontFamily = 'Arial, sans-serif';
    ui.style.width = '220px';

    ui.innerHTML = `
        <div style="margin-bottom: 10px; font-weight: bold; font-size: 14px; color: #333;">Auto Seleção de Tabela</div>
        <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #555;">Quantidade para marcar:</label>
        <input type="number" id="vm-target-count" value="50" style="width: 100%; padding: 6px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;" min="1" />
        <button id="vm-btn-activate" style="display: block; width: 100%; padding: 8px; background: #007bff; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Ativar Espera</button>
        <button id="vm-btn-stop" style="display: none; width: 100%; padding: 8px; background: #dc3545; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-top: 5px;">Parar / Cancelar</button>
        <div id="vm-status" style="margin-top: 10px; font-size: 11px; color: #666; word-wrap: break-word;">Status: Inativo</div>
    `;
    document.body.appendChild(ui);

    let isActive = false;
    let isProcessing = false;
    let forceStop = false;
    let countSelected = 0;
    let targetCount = 0;

    const btnActivate = document.getElementById('vm-btn-activate');
    const btnStop = document.getElementById('vm-btn-stop');
    const inputCount = document.getElementById('vm-target-count');
    const statusText = document.getElementById('vm-status');

    btnActivate.addEventListener('click', () => {
        isActive = !isActive;
        if (isActive) {
            targetCount = parseInt(inputCount.value, 10);
            if (isNaN(targetCount) || targetCount <= 0) {
                alert('Insira uma quantidade válida.');
                isActive = false;
                return;
            }
            btnActivate.textContent = 'Cancelar Espera';
            btnActivate.style.background = '#6c757d';
            statusText.textContent = 'Aguardando 1º clique...';
            statusText.style.color = '#d39e00';
        } else {
            btnActivate.textContent = 'Ativar Espera';
            btnActivate.style.background = '#007bff';
            statusText.textContent = 'Status: Inativo';
            statusText.style.color = '#666';
        }
    });

    btnStop.addEventListener('click', () => {
        forceStop = true;
    });

    document.addEventListener('change', function(e) {
        if (isActive && e.target.matches('.virtual-table-body-container input[type="checkbox"]')) {
            isActive = false;
            isProcessing = true;
            forceStop = false;

            btnActivate.style.display = 'none';
            btnStop.style.display = 'block';

            if (!e.target.checked) {
                resetUI('Cancelado: Você desmarcou o item.');
                return;
            }

            statusText.textContent = 'Processando...';
            statusText.style.color = '#28a745';

            countSelected = 1;
            startSelectionLoop(e.target);
        }
    });

    function startSelectionLoop(initialCheckbox) {
        const container = document.querySelector('.virtual-table-body-container');
        if (!container) {
            resetUI('Erro: Tabela não encontrada.');
            return;
        }

        let firstPass = true;
        let idleAttempts = 0;
        const maxIdle = 6;

        function processNext() {
            if (forceStop) {
                resetUI(`Parado pelo usuário. (${countSelected}/${targetCount})`);
                return;
            }

            const allCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));

            let startIndex = 0;
            if (firstPass) {
                startIndex = allCheckboxes.indexOf(initialCheckbox);
                if (startIndex === -1) startIndex = 0;
                firstPass = false;
                startIndex += 1;
            }

            let clickedInThisPass = false;

            for (let i = startIndex; i < allCheckboxes.length; i++) {
                if (countSelected >= targetCount) break;

                let cb = allCheckboxes[i];
                if (!cb.checked) {
                    cb.click();
                    countSelected++;
                    clickedInThisPass = true;
                }
            }

            if (countSelected >= targetCount) {
                resetUI(`Concluído! (${countSelected}/${targetCount})`);
                return;
            }

            if (clickedInThisPass) {
                idleAttempts = 0;
            } else {
                idleAttempts++;
            }

            if (idleAttempts >= maxIdle) {
                resetUI(`Fim da lista atingido. Marcados: ${countSelected}/${targetCount}`);
                return;
            }

            if (idleAttempts > 0) {
                statusText.textContent = `Carregando mais... (${idleAttempts}/6)`;
                statusText.style.color = '#d39e00';
            } else {
                statusText.textContent = `Marcando... (${countSelected} de ${targetCount})`;
                statusText.style.color = '#28a745';
            }

            // Tática de rolagem infalível: Foca a câmera no último checkbox e dá um empurrão na div
            if (allCheckboxes.length > 0) {
                const lastCheckbox = allCheckboxes[allCheckboxes.length - 1];

                // Puxa a visão da tela direto para o último item desenhado
                lastCheckbox.scrollIntoView({ behavior: 'smooth', block: 'end' });

                // Empurrão extra direto no contêiner para garantir que o framework de virtualização sinta o scroll
                container.scrollBy({ top: 400, behavior: 'smooth' });
                container.dispatchEvent(new Event('scroll', { bubbles: true }));
            }

            setTimeout(processNext, 800);
        }

        setTimeout(processNext, 100);
    }

    function resetUI(message) {
        isProcessing = false;
        btnActivate.style.display = 'block';
        btnStop.style.display = 'none';
        btnActivate.textContent = 'Ativar Espera';
        btnActivate.style.background = '#007bff';
        statusText.textContent = message;
        statusText.style.color = '#333';
    }
})();
