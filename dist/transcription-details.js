let autoRefresh = true;
let refreshInterval;

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    loadProjects();
    startAutoRefresh();
});

async function loadProjects() {
    try {
        const response = await fetch('/transcription/projects');
        const data = await response.json();
        
        if (data.projects) {
            renderProjects(data.projects);
        } else {
            showError('Failed to load projects: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        showError('Failed to load projects: ' + error.message);
    }
}

function renderProjects(projects) {
    const container = document.getElementById('projectsContainer');
    
    if (projects.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 50px; color: white;">
                <p>No transcription projects found.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="project-card">
            <div class="project-header" onclick="toggleProject('${project.name}')">
                <div class="project-title">
                    <span class="expand-icon" id="icon-${project.name}">▶</span>
                    📁 ${project.name}
                </div>
                <div class="project-stats">
                    <span class="stat stat-completed">${project.completed} completed</span>
                    <span class="stat stat-processing">${project.processing} processing</span>
                    <span class="stat stat-pending">${project.pending} pending</span>
                    ${project.failed > 0 ? `<span class="stat stat-failed">${project.failed} failed</span>` : ''}
                </div>
            </div>
            <div class="project-files" id="files-${project.name}">
                ${project.files.map(file => renderFile(file)).join('')}
            </div>
        </div>
    `).join('');
}

function renderFile(file) {
    const statusIcons = {
        completed: '✅',
        processing: '🔄',
        pending: '⏳',
        failed: '❌'
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleString();
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '';
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)} MB`;
    };

    return `
        <div class="file-item">
            <div class="file-info">
                <span class="file-status-icon">${statusIcons[file.status]}</span>
                <div>
                    <div class="file-name">${file.fileName}</div>
                    <div class="file-meta">
                        ${formatFileSize(file.fileSize)} • 
                        Created: ${formatDate(file.createdAt)}
                        ${file.completedAt ? ` • Completed: ${formatDate(file.completedAt)}` : ''}
                        ${file.elapsedFormatted ? ` • ⏱️ Elapsed: ${file.elapsedFormatted}` : ""}
                        ${file.processingFormatted ? ` • 🔄 Processing: ${file.processingFormatted}` : ""}
                        ${file.error ? ` • ❌ Error: ${file.error}` : ""}
                    </div>
                </div>
            </div>
            <div class="file-actions">
                ${file.status === 'failed' ? 
                    `<button class="btn btn-small btn-retry" onclick="retryJob('${file.id}')">🔄 Retry</button>` : 
                    ''
                }
                ${file.status === 'completed' && file.outputPath ? 
                    `<button class="btn btn-small" onclick="downloadTranscript('${file.id}')">📄 Download</button>` : 
                    ''
                }
            </div>
        </div>
    `;
}

function toggleProject(projectName) {
    const filesDiv = document.getElementById(`files-${projectName}`);
    const icon = document.getElementById(`icon-${projectName}`);
    
    if (filesDiv.classList.contains('expanded')) {
        filesDiv.classList.remove('expanded');
        icon.classList.remove('expanded');
    } else {
        filesDiv.classList.add('expanded');
        icon.classList.add('expanded');
    }
}

async function retryJob(jobId) {
    try {
        const response = await fetch(`/transcription/retry/${jobId}`, {
            method: 'POST'
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            // Refresh the projects to show updated status
            loadProjects();
            showSuccess('Job queued for retry successfully!');
        } else {
            showError('Failed to retry job: ' + result.message);
        }
    } catch (error) {
        showError('Failed to retry job: ' + error.message);
    }
}

function downloadTranscript(jobId) {
    // This would need to be implemented based on your file serving setup
    showError('Download functionality not yet implemented');
}

function refreshProjects() {
    loadProjects();
}

function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    const btn = document.getElementById('autoRefreshBtn');
    btn.textContent = `⏱️ Auto-Refresh: ${autoRefresh ? 'ON' : 'OFF'}`;
    
    if (autoRefresh) {
        startAutoRefresh();
    } else {
        stopAutoRefresh();
    }
}

function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(loadProjects, 30000); // 30 seconds
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

function showError(message) {
    const container = document.getElementById('projectsContainer');
    container.innerHTML = `<div class="error-message">${message}</div>` + container.innerHTML;
    setTimeout(() => {
        const errorDiv = container.querySelector('.error-message');
        if (errorDiv) errorDiv.remove();
    }, 5000);
}

function showSuccess(message) {
    const container = document.getElementById('projectsContainer');
    container.innerHTML = `<div style="background: rgba(52,199,89,0.1); color: #2e7d32; padding: 15px; border-radius: 12px; margin: 20px 0; text-align: center; border: 1px solid rgba(52,199,89,0.2);">${message}</div>` + container.innerHTML;
    setTimeout(() => {
        const successDiv = container.querySelector('div[style*="rgba(52,199,89"]');
        if (successDiv) successDiv.remove();
    }, 3000);
}
