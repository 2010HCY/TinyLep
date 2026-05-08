import { initI18n, t } from './i18n.js';
const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { getCurrentWebviewWindow } = window.__TAURI__.webviewWindow;

initI18n();

const viewImport = document.getElementById('view-import');
const viewProcess = document.getElementById('view-process');
const fileListEl = document.getElementById('file-list');
const btnBack = document.getElementById('btn-back');
const btnClear = document.getElementById('btn-clear');
const btnStart = document.getElementById('btn-start');
const modalConflict = document.getElementById('modal-conflict');

const progressWrapper = document.getElementById('progress-wrapper');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const tplTrashIcon = document.getElementById('tpl-trash-icon');

let currentFiles = [];
let customOutputDir = null;
let isProcessing = false;

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function renderList() {
    fileListEl.innerHTML = '';
    let totalSize = 0;
    
    currentFiles.forEach((fileObj, index) => {
        totalSize += fileObj.size;
        
        const row = document.createElement('div');
        row.className = 'list-row';
        row.id = `row-${index}`;
        
        row.innerHTML = `
            <div class="col-name" title="${fileObj.path}">${fileObj.path.split('\\').pop().split('/').pop()}</div>
            <div class="col-size" id="size-before-${index}">${formatBytes(fileObj.size)}</div>
            <div class="col-size" id="size-after-${index}">${t('txtWait')}</div>
            <div class="col-ratio" id="ratio-${index}">--</div>
            <div class="col-action" id="action-${index}"></div>
        `;

        const actionCol = row.querySelector(`#action-${index}`);
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-icon';
        btnDelete.appendChild(tplTrashIcon.content.cloneNode(true));
        
        btnDelete.onclick = () => {
            if(isProcessing) return; 
            currentFiles.splice(index, 1);
            if(currentFiles.length === 0) goBack();
            else renderList();
        };
        actionCol.appendChild(btnDelete);
        fileListEl.appendChild(row);
    });

    document.getElementById('val-total-before').textContent = formatBytes(totalSize);
    document.getElementById('val-total-after').textContent = '--';
    document.getElementById('val-total-ratio').textContent = '--';
    document.getElementById('val-total-ratio').style.color = 'var(--text-main)';
    
    progressFill.style.width = `0%`;
    progressText.textContent = `0 / ${currentFiles.length}`;
}

async function processRawPaths(rawPaths) {
    if(!rawPaths || rawPaths.length === 0) return;
    const scannedFiles = await invoke('scan_paths', { paths: rawPaths });
    
    if(scannedFiles.length === 0) return;
    
    const newFiles = scannedFiles.filter(newF => !currentFiles.some(f => f.path === newF.path));
    currentFiles = currentFiles.concat(newFiles);
    
    renderList();
    viewImport.classList.remove('active');
    viewProcess.classList.add('active');
}

function goBack() {
    if(isProcessing) return;
    currentFiles = [];
    viewProcess.classList.remove('active');
    viewImport.classList.add('active');
}

document.getElementById('btn-select-file').addEventListener('click', async () => {
    const selected = await open({ multiple: true, filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'lep'] }] });
    if (selected) processRawPaths(selected);
});

document.getElementById('btn-select-folder').addEventListener('click', async () => {
    const selected = await open({ multiple: true, directory: true });
    if (selected) processRawPaths(selected);
});

getCurrentWebviewWindow().onDragDropEvent((event) => {
    const dropZone = document.getElementById('drop-zone');
    if (event.payload.type === 'over') dropZone.classList.add('drag-over');
    else if (event.payload.type === 'drop') {
        dropZone.classList.remove('drag-over');
        processRawPaths(event.payload.paths);
    } else dropZone.classList.remove('drag-over');
});

btnBack.addEventListener('click', goBack);
btnClear.addEventListener('click', goBack);

document.getElementById('btn-select-dir').addEventListener('click', async () => {
    if(isProcessing) return;
    const dir = await open({ directory: true });
    if (dir) {
        customOutputDir = dir;
        document.getElementById('output-dir-path').textContent = dir;
    }
});

btnStart.addEventListener('click', async () => {
    if(isProcessing || currentFiles.length === 0) return;
    
    const keepStruct = document.getElementById('chk-keep-structure').checked;
    
    const conflicts = await invoke('check_file_conflict', { 
        files: currentFiles, 
        outputDir: customOutputDir,
        keepStructure: keepStruct
    });
    
    if (conflicts.length > 0) {
        document.getElementById('conflict-list').innerHTML = conflicts.map(c => `<li>${c}</li>`).join('');
        modalConflict.classList.remove('hidden');
        return;
    }
    runCompression();
});

document.getElementById('btn-modal-cancel').addEventListener('click', () => modalConflict.classList.add('hidden'));
document.getElementById('btn-modal-confirm').addEventListener('click', () => { modalConflict.classList.add('hidden'); runCompression(); });

async function runCompression() {
    isProcessing = true;
    const total = currentFiles.length;
    
    btnStart.disabled = true; btnBack.disabled = true; btnClear.disabled = true;
    document.querySelectorAll('.btn-icon').forEach(btn => btn.disabled = true);
    btnStart.textContent = t('txtProcessing');
    
    progressFill.style.width = `0%`;
    progressText.textContent = `0 / ${total}`;

    const noProg = document.getElementById('chk-no-progressive').checked;
    const acceptDqt = document.getElementById('chk-accept-dqt').checked;
    const keepStruct = document.getElementById('chk-keep-structure').checked;
    const deleteSource = document.getElementById('chk-delete-source').checked;

    let accumulatedOriginal = 0;
    let accumulatedProcessed = 0;

    for (let i = 0; i < total; i++) {
        try {
            const res = await invoke('run_lepton_task', {
                inputPath: currentFiles[i].path, 
                basePath: currentFiles[i].base_path,
                outputDir: customOutputDir,
                keepStructure: keepStruct,
                noProgressive: noProg, 
                acceptDqtswithzeros: acceptDqt
            });
            
            if (deleteSource) {
                try {
                    await invoke('delete_source_file', { path: currentFiles[i].path });
                } catch (deleteError) {
                    console.warn('删除源文件失败:', deleteError);
                }
            }
            
            let originalSize = res.original_size > 0 ? res.original_size : currentFiles[i].size;
            accumulatedOriginal += originalSize;
            accumulatedProcessed += res.processed_size;

            document.getElementById(`size-before-${i}`).textContent = formatBytes(originalSize);
            document.getElementById(`size-after-${i}`).textContent = formatBytes(res.processed_size);
            
            let ratio = originalSize > 0 ? ((originalSize - res.processed_size) / originalSize * 100).toFixed(2) : 0;
            const ratioEl = document.getElementById(`ratio-${i}`);
            ratioEl.textContent = `${ratio > 0 ? '-' : '+'}${Math.abs(ratio)}%`;
            ratioEl.className = ratio > 0 ? 'col-ratio ratio-green' : 'col-ratio ratio-red';

            const actionEl = document.getElementById(`action-${i}`);
            actionEl.innerHTML = `<button class="btn sm" data-i18n="btnOpen">${t('btnOpen')}</button>`;
            actionEl.querySelector('button').onclick = () => { invoke('reveal_in_explorer', { path: res.output_path }); };
        } catch (e) {
            console.error(`文件 [${currentFiles[i].path}] 处理失败，原因:`, e); 
            let errorMsg = (typeof e === 'string') ? e : JSON.stringify(e);
            
            const cellAfter = document.getElementById(`size-after-${i}`);
            
            cellAfter.innerHTML = `<span class="status-failed" title="${errorMsg.replace(/"/g, '&quot;')}">${t('txtFailed')}</span>`;
            
            accumulatedOriginal += currentFiles[i].size;
            accumulatedProcessed += currentFiles[i].size;
        }

        document.getElementById('val-total-after').textContent = formatBytes(accumulatedProcessed);
        let currentRatio = accumulatedOriginal > 0 ? ((accumulatedOriginal - accumulatedProcessed) / accumulatedOriginal * 100).toFixed(2) : 0;
        const valTotalRatioEl = document.getElementById('val-total-ratio');
        valTotalRatioEl.textContent = `${currentRatio > 0 ? '-' : '+'}${Math.abs(currentRatio)}%`;
        valTotalRatioEl.style.color = currentRatio > 0 ? '#2e7d32' : '#c62828';

        progressFill.style.width = `${((i + 1) / total) * 100}%`;
        progressText.textContent = `${i + 1} / ${total}`;
    }
    
    isProcessing = false; 
    btnStart.disabled = false; 
    btnStart.textContent = t('btnStart'); 
    btnBack.disabled = false; btnClear.disabled = false;
}

// 赞助按钮
const btnSponsorModal = document.getElementById('btn-sponsor-modal');
const modalSponsor = document.getElementById('modal-sponsor');
const btnCloseSponsor = document.getElementById('btn-close-sponsor');

if (btnSponsorModal && modalSponsor && btnCloseSponsor) {
    btnSponsorModal.addEventListener('click', () => {
        modalSponsor.classList.remove('hidden');
    });
    btnCloseSponsor.addEventListener('click', () => {
        modalSponsor.classList.add('hidden');
    });
    modalSponsor.addEventListener('click', (e) => {
        if (e.target === modalSponsor) {
            modalSponsor.classList.add('hidden');
        }
    });
}