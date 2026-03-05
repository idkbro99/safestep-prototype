// Map State
const manilaCenter = [14.6060, 120.9870]; 
let map, heatmapLayer, routingLine;
let mapTilesLight, mapTilesDark;

// Application State
let activeFilter = 'all';
let activeSort = 'relevant';
let activeDetailId = null;
let currentTags = [];
let idCounter = 1;

// Radius Filtering State
let isRadiusActive = false;
let radiusCenterCoords = null;
let radiusCircle = null;

// Custom Pin State
let isPickingLocation = false;
let customPinCoords = null;
let customPinMarker = null;

// Routing & Dragging State
let searchTimeout;
let startCoords = null, endCoords = null;
let isDragging = false, currentX=0, currentY=0, initialX=0, initialY=0, xOffset = 0, yOffset = 0;

// SPLIT DATA: Broad City Risk Summaries
const citySummaries = [
    { name: 'City of Manila', risk: 82 },
    { name: 'Quezon City', risk: 65 },
    { name: 'Caloocan City', risk: 70 },
    { name: 'Makati City', risk: 25 },
    { name: 'Taguig City', risk: 18 },
    { name: 'Pasay City', risk: 85 }
];

// SPLIT DATA: Specific High-Density Zones
const hotspots = [
    { name: 'FEU Tech & Main', lat: 14.6040, lng: 120.9875, risk: 90, spread: 0.005, reports: 45 },
    { name: 'UST España Blvd', lat: 14.6096, lng: 120.9894, risk: 85, spread: 0.007, reports: 40 },
    { name: 'SM San Lazaro', lat: 14.6155, lng: 120.9841, risk: 78, spread: 0.006, reports: 35 },
    { name: 'LRT Tayuman Station', lat: 14.6168, lng: 120.9825, risk: 82, spread: 0.004, reports: 25 },
    { name: 'Araneta Center Cubao', lat: 14.6186, lng: 121.0526, risk: 68, spread: 0.015, reports: 20 },
    { name: 'Makati Poblacion', lat: 14.5630, lng: 121.0310, risk: 45, spread: 0.008, reports: 12 },
    { name: 'Monumento Circle', lat: 14.6565, lng: 120.9830, risk: 75, spread: 0.012, reports: 20 },
    { name: 'Taft Ave (DLSU area)', lat: 14.5650, lng: 120.9930, risk: 70, spread: 0.010, reports: 30 }
];

let mockReports = [];

hotspots.forEach(spot => {
    for(let i=0; i<spot.reports; i++) {
        const types = ['Harassment/Aggression', 'Crowd/Atmosphere', 'Environmental/Path Hazards', 'Accessibility/Obstructions'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        let issueDesc = `Community report regarding safety at this location. Needs local barangay attention.`;
        if(type === 'Accessibility/Obstructions') issueDesc = "Damaged sidewalks and blocked PWD ramps reported here. Very difficult for wheelchairs.";
        if(type === 'Environmental/Path Hazards') issueDesc = "Poor lighting and potential flooding hazards reported. Avoid walking alone at night.";
        
        mockReports.push({
            id: idCounter++, type: type, title: `${type.split('/')[0]} near ${spot.name.split(' ')[0]}`, desc: issueDesc,
            cred: Math.floor(Math.random() * 300) + 10, relevance: spot.risk + Math.random() * 30,
            lat: spot.lat + (Math.random() - 0.5) * spot.spread, lng: spot.lng + (Math.random() - 0.5) * spot.spread,
            tags: ['#' + spot.name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '')],
            userVote: 0, timestamp: Date.now() - (Math.random() * 10000000000), 
            comments: Math.random() > 0.6 ? [{text: "Noted, thank you for sharing.", isMine: false}] : [],
            isMine: false
        });
    }
});

function initMap() {
    map = L.map('map', { zoomControl: false }).setView(manilaCenter, 14);
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapTilesLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    mapTilesDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    
    if(document.documentElement.classList.contains('dark')) mapTilesDark.addTo(map);
    else mapTilesLight.addTo(map);

    populateHeatmap();
    renderReports();
    populatePartnerPortal();
    setupDrag();
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2-lat1)*Math.PI/180;
    const dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function populateHeatmap() {
    if(heatmapLayer) map.removeLayer(heatmapLayer);
    
    let filteredData = mockReports;
    if(isRadiusActive && radiusCenterCoords) {
        filteredData = mockReports.filter(r => getDistance(radiusCenterCoords[0], radiusCenterCoords[1], r.lat, r.lng) <= 5);
    }

    let heatData = filteredData.map(r => [r.lat, r.lng, r.cred / 80]); 
    filteredData.forEach(r => {
        for(let i=0; i<4; i++) {
            heatData.push([r.lat + (Math.random()-0.5)*0.0015, r.lng + (Math.random()-0.5)*0.0015, Math.random() * 0.5]);
        }
    });
    
    heatmapLayer = L.heatLayer(heatData, {
        radius: 26, blur: 22, maxZoom: 18,
        gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    });
    
    if(document.getElementById('heatmap-toggle').checked) {
        heatmapLayer.addTo(map);
        updateOpacity(); 
    }
}

function enableRadiusFilter() {
    const btn = document.getElementById('radius-btn');
    if(isRadiusActive) {
        isRadiusActive = false;
        if(radiusCircle) map.removeLayer(radiusCircle);
        btn.innerHTML = "📍 Focus 5km Area";
        btn.classList.replace('bg-rose-600', 'bg-indigo-600');
        populateHeatmap();
        showToast("Showing all NCR data.", "success");
    } else {
        showToast("Click any location on the map to set 5km focus area.", "success");
        document.getElementById('map').style.cursor = 'crosshair';
        
        map.once('click', function(e) {
            document.getElementById('map').style.cursor = '';
            radiusCenterCoords = [e.latlng.lat, e.latlng.lng];
            isRadiusActive = true;
            
            if(radiusCircle) map.removeLayer(radiusCircle);
            radiusCircle = L.circle(radiusCenterCoords, {radius: 5000, color: '#4f46e5', fillOpacity: 0.1, weight: 2}).addTo(map);
            
            btn.innerHTML = "✕ Clear 5km Focus";
            btn.classList.replace('bg-indigo-600', 'bg-rose-600');
            populateHeatmap();
        });
    }
}

function updateOpacity() {
    const val = document.getElementById('heatmap-opacity').value;
    const canvases = document.querySelectorAll('.leaflet-heatmap-layer');
    canvases.forEach(c => {
        c.style.opacity = val;
    });
}

// AI Checker
function aiContentCheck(text) {
    const badWords = ['gago', 'puta', 'bobo', 'shit', 'fuck', 'spam', 'asshole'];
    const lower = text.toLowerCase();
    if(badWords.some(bw => lower.includes(bw))) return "Inappropriate language detected. Kept clean for community safety.";
    if(/(.)\1{4,}/.test(text)) return "Gibberish or repetitive spam detected.";
    if(text.length > 25 && !/\s/.test(text)) return "Invalid text format (missing spaces).";
    return null;
}

function enableMapPicker() {
    closeReportModal();
    showToast("Click anywhere on the map to drop a pin.", "success");
    document.getElementById('map').style.cursor = 'crosshair';
    isPickingLocation = true;
    
    map.once('click', function(e) {
        isPickingLocation = false;
        document.getElementById('map').style.cursor = '';
        customPinCoords = [e.latlng.lat, e.latlng.lng];
        
        if(customPinMarker) map.removeLayer(customPinMarker);
        customPinMarker = L.marker(customPinCoords).addTo(map);
        
        openReportModal();
        document.getElementById('loc-privacy').value = 'precise';
        document.getElementById('pin-status').classList.remove('hidden');
    });
}

// --- FIXED DRAG BOUNDARIES ---
function setupDrag() {
    const dragItem = document.getElementById("route-panel");
    const dragHeader = document.getElementById("route-panel-header");

    dragHeader.addEventListener("mousedown", dragStart, false);
    document.addEventListener("mouseup", dragEnd, false);
    document.addEventListener("mousemove", drag, false);

    function dragStart(e) {
        initialX = e.clientX - xOffset; initialY = e.clientY - yOffset;
        if (e.target === dragHeader || dragHeader.contains(e.target)) isDragging = true;
    }

    function dragEnd(e) { initialX = currentX; initialY = currentY; isDragging = false; }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            let testX = e.clientX - initialX;
            let testY = e.clientY - initialY;
            
            const mapWidth = window.innerWidth;
            const mapHeight = window.innerHeight;
            const panelRect = dragItem.getBoundingClientRect();
            
            // Check if sidebar is open to prevent dragging underneath it
            const sidebar = document.getElementById('user-sidebar');
            const isSidebarOpen = !sidebar.classList.contains('-translate-x-full');
            const sidebarWidth = (isSidebarOpen && mapWidth >= 768) ? sidebar.offsetWidth : 0;
            
            const minX = -panelRect.left + xOffset + sidebarWidth + 10; 
            const maxX = mapWidth - panelRect.right + xOffset - 10;
            const minY = -panelRect.top + yOffset + 64; 
            const maxY = mapHeight - panelRect.bottom + yOffset - 10;

            currentX = Math.max(minX, Math.min(testX, maxX));
            currentY = Math.max(minY, Math.min(testY, maxY));
            
            xOffset = currentX; yOffset = currentY;
            dragItem.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    }
}

function formatDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' • ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function showToast(msg, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colorClass = type === 'error' ? 'bg-rose-500' : 'bg-emerald-500';
    toast.className = `${colorClass} text-white px-6 py-3 rounded-lg shadow-xl font-bold text-sm transform transition-all duration-300 translate-y-[-20px] opacity-0 flex items-center gap-2`;
    toast.innerHTML = type === 'error' ? `<span>⚠️</span> ${msg}` : `<span>✅</span> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.remove('translate-y-[-20px]', 'opacity-0'); }, 10);
    setTimeout(() => { toast.classList.add('opacity-0'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function toggleDarkMode() {
    const html = document.documentElement;
    if(html.classList.contains('dark')) {
        html.classList.remove('dark'); map.removeLayer(mapTilesDark); mapTilesLight.addTo(map);
    } else {
        html.classList.add('dark'); map.removeLayer(mapTilesLight); mapTilesDark.addTo(map);
    }
    setTimeout(updateOpacity, 100);
}

function toggleSidebar() {
    document.getElementById('user-sidebar').classList.toggle('-translate-x-full');
    document.getElementById('expand-sidebar-btn').classList.toggle('hidden');
    // Force route panel boundary recalculation if they move the sidebar
    setupDrag();
}

function toggleHeatmap() {
    if(document.getElementById('heatmap-toggle').checked) { map.addLayer(heatmapLayer); updateOpacity(); }
    else map.removeLayer(heatmapLayer);
}

function setCategoryFilter(cat) {
    activeFilter = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-slate-50', 'dark:bg-slate-800', 'text-slate-600');
    });
    event.target.classList.add('bg-indigo-600', 'text-white');
    event.target.classList.remove('bg-slate-50', 'dark:bg-slate-800', 'text-slate-600');
    filterReports();
}

function setSortFilter(sortType) {
    activeSort = sortType;
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'underline');
        btn.classList.add('text-slate-500', 'dark:text-slate-400');
    });
    event.target.classList.add('text-indigo-600', 'dark:text-indigo-400', 'underline');
    event.target.classList.remove('text-slate-500');
    filterReports();
}

function filterReports() {
    const search = document.getElementById('search-bar').value.toLowerCase();
    let filtered = mockReports.filter(report => {
        const matchCat = activeFilter === 'all' || report.type === activeFilter;
        const matchSearch = report.title.toLowerCase().includes(search) || report.desc.toLowerCase().includes(search);
        const matchRadius = (!isRadiusActive || !radiusCenterCoords) ? true : (getDistance(radiusCenterCoords[0], radiusCenterCoords[1], report.lat, report.lng) <= 5);
        return matchCat && matchSearch && matchRadius;
    });

    if(activeSort === 'relevant') filtered.sort((a,b) => b.relevance - a.relevance);
    else if(activeSort === 'popular') filtered.sort((a,b) => b.cred - a.cred);
    else if(activeSort === 'newest') filtered.sort((a,b) => b.timestamp - a.timestamp);
    else if(activeSort === 'oldest') filtered.sort((a,b) => a.timestamp - b.timestamp);
    
    renderReports(filtered);
}

function renderReports(reportsToRender = null) {
    if(!reportsToRender) { filterReports(); return; } 
    const list = document.getElementById('reports-list');
    list.innerHTML = '';
    
    reportsToRender.forEach(report => {
        let typeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';
        if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 border-rose-100';
        if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 border-amber-100';
        if(report.type.includes('Accessibility')) typeColor = 'text-purple-600 bg-purple-50 border-purple-100 dark:bg-purple-900/30 dark:text-purple-400 border-purple-800';

        const actionBtn = report.isMine 
            ? `<button onclick="event.stopPropagation(); deleteReport(${report.id})" class="text-rose-500 hover:text-rose-700 font-bold text-xs bg-rose-50 dark:bg-rose-900/30 px-2 py-1 rounded">🗑 Delete</button>`
            : `<button onclick="event.stopPropagation(); openFlagModal(${report.id})" class="text-slate-400 hover:text-rose-500 font-bold text-xs">🚩 Flag</button>`;

        const tagHTML = report.tags.map(t => `<span class="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">${t}</span>`).join('');

        // Dynamic Voting Styles
        const upBtnStyle = report.userVote === 1 ? "text-emerald-500 scale-125" : "text-slate-400 hover:text-emerald-500";
        const downBtnStyle = report.userVote === -1 ? "text-rose-500 scale-125" : "text-slate-400 hover:text-rose-500";

        list.innerHTML += `
            <div onclick="openDetailModal(${report.id})" class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 hover:border-indigo-400 cursor-pointer relative group transition-all">
                <div class="absolute top-4 right-4">${actionBtn}</div>
                <div class="mb-2 flex items-center gap-2">
                    <span class="text-[10px] font-bold ${typeColor} uppercase tracking-wider px-2 py-1 rounded border inline-block">${report.type.split('/')[0]}</span>
                    <span class="text-[10px] text-slate-400 font-medium">${formatDate(report.timestamp)}</span>
                </div>
                <h3 class="font-bold text-slate-800 dark:text-white text-sm mb-1.5 pr-12">${report.title}</h3>
                <p class="text-xs text-slate-600 dark:text-slate-300 mb-3 line-clamp-2 leading-relaxed">${report.desc}</p>
                <div class="flex flex-wrap gap-1.5 mb-3">${tagHTML}</div>
                <div class="flex justify-between items-center border-t border-slate-100 dark:border-slate-700 pt-3">
                    <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400">💬 ${report.comments.length} Comments</span>
                    <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700" onclick="event.stopPropagation()">
                        <button onclick="voteReport(${report.id}, 1)" class="font-bold text-base transition-all ${upBtnStyle}">⇧</button>
                        <span class="font-bold text-sm text-slate-700 dark:text-slate-200 w-6 text-center">${report.cred}</span>
                        <button onclick="voteReport(${report.id}, -1)" class="font-bold text-base transition-all ${downBtnStyle}">⇩</button>
                    </div>
                </div>
            </div>
        `;
    });
}

function deleteReport(id) {
    if(confirm("Are you sure you want to permanently delete this report?")) {
        mockReports = mockReports.filter(r => r.id !== id);
        showToast("Report deleted successfully.", "success");
        populateHeatmap();
        filterReports();
    }
}

function deleteComment(reportId, commentIndex) {
    if(confirm("Delete your comment?")) {
        const report = mockReports.find(r => r.id === reportId);
        report.comments.splice(commentIndex, 1);
        showToast("Comment deleted.", "success");
        openDetailModal(reportId);
        filterReports(); 
    }
}

function openFlagModal(id) {
    document.getElementById('flag-reason').value = '';
    document.getElementById('flag-modal').classList.remove('hidden');
}
function closeFlagModal() { document.getElementById('flag-modal').classList.add('hidden'); }
function submitFlag() {
    if(!document.getElementById('flag-reason').value) return showToast("Select a reason.", "error");
    closeFlagModal(); showToast("Report flagged for human review.", "success");
}

// --- FIXED VOTING LOGIC ---
function voteReport(id, change) {
    const report = mockReports.find(r => r.id === id);
    if (!report) return;

    if (change === 1) { // Upvote clicked
        if (report.userVote === 1) { report.cred--; report.userVote = 0; } // Undo upvote
        else if (report.userVote === -1) { report.cred += 2; report.userVote = 1; } // Switch from down to up
        else { report.cred++; report.userVote = 1; } // New upvote
    } else if (change === -1) { // Downvote clicked
        if (report.userVote === -1) { report.cred++; report.userVote = 0; } // Undo downvote
        else if (report.userVote === 1) { report.cred -= 2; report.userVote = -1; } // Switch from up to down
        else { report.cred--; report.userVote = -1; } // New downvote
    }
    
    filterReports();
    if(activeDetailId === id) openDetailModal(id);
}

function openDetailModal(id) {
    activeDetailId = id;
    const report = mockReports.find(r => r.id === id);
    document.getElementById('detail-content').innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <span class="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider px-2 py-1 rounded border border-slate-200 dark:border-slate-700">${report.type}</span>
            <span class="text-xs text-slate-400">${formatDate(report.timestamp)}</span>
        </div>
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-3">${report.title}</h2>
        <p class="text-sm text-slate-600 dark:text-slate-300 mb-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg leading-relaxed">${report.desc}</p>
    `;
    
    const cList = document.getElementById('detail-comments');
    cList.innerHTML = report.comments.length ? '' : '<p class="text-sm text-slate-400">No comments yet.</p>';
    report.comments.forEach((c, idx) => {
        const delBtn = c.isMine ? `<button onclick="deleteComment(${report.id}, ${idx})" class="text-rose-500 hover:text-rose-700 font-bold ml-3 text-xs">Delete</button>` : '';
        cList.innerHTML += `<div class="bg-slate-50 dark:bg-slate-800 p-3.5 rounded-lg text-sm flex justify-between items-start border border-slate-100 dark:border-slate-700"><p class="text-slate-800 dark:text-slate-200">${c.text}</p>${delBtn}</div>`;
    });
    document.getElementById('report-detail-modal').classList.remove('hidden');
}
function closeDetailModal() { document.getElementById('report-detail-modal').classList.add('hidden'); }

function submitComment() {
    const val = document.getElementById('new-comment').value.trim();
    if(!val) return;
    
    const aiError = aiContentCheck(val);
    if(aiError) return showToast(`AI Flag: ${aiError}`, "error");

    const report = mockReports.find(r => r.id === activeDetailId);
    report.comments.push({ text: val, isMine: true }); 
    document.getElementById('new-comment').value = '';
    openDetailModal(activeDetailId);
    filterReports();
}

function openReportModal() { document.getElementById('report-modal').classList.remove('hidden'); }
function closeReportModal() { 
    document.getElementById('report-modal').classList.add('hidden'); 
    document.getElementById('pin-status').classList.add('hidden');
}

function submitReport() {
    const title = document.getElementById('report-title').value;
    const cat = document.getElementById('report-category').value;
    const desc = document.getElementById('report-desc').value;
    const privacy = document.getElementById('loc-privacy').value;
    
    if(!title || !cat || desc.length < 15) return showToast("Please fill all required fields correctly.", "error");

    const aiError = aiContentCheck(desc) || aiContentCheck(title);
    if(aiError) return showToast(`AI Flag: ${aiError}`, "error");

    let finalLat = manilaCenter[0] + (Math.random() - 0.5) * 0.01;
    let finalLng = manilaCenter[1] + (Math.random() - 0.5) * 0.01;
    
    if (privacy === 'precise' && customPinCoords) {
        finalLat = customPinCoords[0];
        finalLng = customPinCoords[1];
    }

    mockReports.unshift({
        id: idCounter++, type: cat, title: title, desc: desc, cred: 1, relevance: 100, timestamp: Date.now(),
        lat: finalLat, lng: finalLng,
        tags: [...currentTags], comments: [], userVote: 1, isMine: true
    });

    closeReportModal();
    populateHeatmap(); 
    filterReports();
    currentTags = []; customPinCoords = null;
    showToast("Report securely submitted.", "success");
}

function suggestTags() {
    const title = document.getElementById('report-title').value.toLowerCase();
    const cat = document.getElementById('report-category').value;
    const aiTags = document.getElementById('ai-tags');
    const container = document.getElementById('tag-container');
    
    let suggested = [];
    if(cat === 'Harassment/Aggression') suggested.push('#unsafe', '#catcalling');
    if(cat === 'Crowd/Atmosphere') suggested.push('#overcrowded', '#pickpocket');
    if(cat === 'Environmental/Path Hazards') suggested.push('#hazard', '#dark_alley');
    if(cat === 'Accessibility/Obstructions') suggested.push('#pwd', '#blocked_path');
    
    if(title.includes('feu') || title.includes('tech')) suggested.push('#FEUTech');
    if(title.includes('ust') || title.includes('espana')) suggested.push('#UST');

    if(suggested.length === 0) { aiTags.classList.add('hidden'); return; }
    
    aiTags.classList.remove('hidden');
    container.innerHTML = suggested.map(tag => 
        `<span class="text-[10px] font-bold bg-white text-indigo-600 border border-indigo-200 px-2 py-1 rounded cursor-pointer hover:bg-indigo-50" onclick="addTag('${tag}')">${tag} +</span>`
    ).join('');
}

function handleTagKeypress(e) { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }
function addCustomTag() {
    let val = document.getElementById('custom-tag-input').value.trim().replace(/\s+/g, '_');
    if(val) {
        if(!val.startsWith('#')) val = '#' + val;
        addTag(val.toLowerCase());
        document.getElementById('custom-tag-input').value = '';
    }
}
function addTag(tag) {
    if(!currentTags.includes(tag) && currentTags.length < 5) {
        currentTags.push(tag);
        document.getElementById('active-tags-container').innerHTML = currentTags.map(t => `<span class="text-xs bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1">${t} <button onclick="removeTag('${t}')" class="hover:text-rose-300 font-bold ml-1">✕</button></span>`).join('');
    }
}
function removeTag(tag) { currentTags = currentTags.filter(t => t !== tag); addTag('hack'); currentTags.pop(); }

function handleSearch(inputEl, resultsId, target) {
    clearTimeout(searchTimeout);
    const query = inputEl.value;
    const resultsUl = document.getElementById(resultsId);
    
    if(query.length < 3) { resultsUl.classList.add('hidden'); return; }

    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=ph`);
            const data = await res.json();
            
            resultsUl.innerHTML = '';
            if(data.length === 0) { resultsUl.classList.add('hidden'); return; }

            data.forEach(item => {
                const li = document.createElement('li');
                li.className = "p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 dark:text-slate-200 text-slate-700";
                li.innerText = item.display_name;
                li.onclick = () => {
                    inputEl.value = item.display_name.split(',')[0];
                    resultsUl.classList.add('hidden');
                    if(target === 'start') startCoords = [parseFloat(item.lat), parseFloat(item.lon)];
                    if(target === 'end') endCoords = [parseFloat(item.lat), parseFloat(item.lon)];
                };
                resultsUl.appendChild(li);
            });
            resultsUl.classList.remove('hidden');
        } catch(e) {}
    }, 500); 
}

async function calculateRealRoute() {
    const btn = document.getElementById('route-btn');
    if(!startCoords || !endCoords) return showToast("Select Start and Destination from suggestions.", "error");

    btn.innerText = "Finding safe paths..."; btn.disabled = true;

    try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(osrmUrl);
        const data = await res.json();

        if(data.code !== "Ok") throw new Error();

        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        const distKm = (data.routes[0].distance / 1000).toFixed(2);
        
        const timeMin = Math.round((distKm / 3.5) * 60);

        if(routingLine) map.removeLayer(routingLine);
        routingLine = L.polyline(coords, { color: '#4f46e5', weight: 6, opacity: 0.8 }).addTo(map);
        map.fitBounds(routingLine.getBounds(), { padding: [50, 50] });

        const steps = data.routes[0].legs[0].steps;
        const streetList = document.getElementById('route-streets');
        streetList.innerHTML = '';
        
        let lastStreet = "";
        steps.forEach(step => {
            if(step.name && step.name !== lastStreet) {
                streetList.innerHTML += `<li class="flex items-center gap-2"><span>▪</span> ${step.name}</li>`;
                lastStreet = step.name;
            }
        });

        document.getElementById('route-details').classList.remove('hidden');
        document.getElementById('clear-route-btn').classList.remove('hidden');
        document.getElementById('route-dist').innerHTML = `🚶 ${distKm} km`;
        document.getElementById('route-time').innerHTML = `⏱ ${timeMin} mins`;
        
    } catch (e) { showToast("Error calculating route.", "error"); }
    btn.innerText = "Calculate Route"; btn.disabled = false;
}

function clearRoute() {
    if(routingLine) map.removeLayer(routingLine);
    document.getElementById('route-details').classList.add('hidden');
    document.getElementById('clear-route-btn').classList.add('hidden');
    document.getElementById('route-start').value = '';
    document.getElementById('route-end').value = '';
    startCoords = null; endCoords = null;
    map.setView(manilaCenter, 14);
}

function togglePortal() { document.getElementById('partner-portal').classList.toggle('hidden'); }
function loginPortal() {
    document.getElementById('portal-login').classList.add('hidden');
    document.getElementById('portal-dashboard').classList.remove('hidden');
    document.getElementById('logout-btn').classList.remove('hidden');
}
function logoutPortal() {
    document.getElementById('portal-dashboard').classList.add('hidden');
    document.getElementById('logout-btn').classList.add('hidden');
    document.getElementById('portal-login').classList.remove('hidden');
    showToast("Logged out securely.", "success");
}

// --- SPLIT PARTNER PORTAL DATA ---
function populatePartnerPortal() {
    const sumContainer = document.getElementById('city-summary-container');
    const alertContainer = document.getElementById('high-alert-container');
    
    sumContainer.innerHTML = '';
    alertContainer.innerHTML = '';

    citySummaries.forEach(city => {
        const color = city.risk > 70 ? 'bg-rose-600' : city.risk > 40 ? 'bg-amber-500' : 'bg-emerald-500';
        sumContainer.innerHTML += `
            <div>
                <div class="flex justify-between text-sm mb-1.5 font-bold">
                    <span class="dark:text-slate-300">${city.name}</span>
                    <span class="text-slate-500 dark:text-slate-400 text-xs">${city.risk}/100</span>
                </div>
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                    <div class="${color} h-2.5 rounded-full" style="width: ${city.risk}%"></div>
                </div>
            </div>`;
    });

    // Only show spots over 65 risk in the high alert section
    const highRiskSpots = hotspots.filter(s => s.risk > 65).sort((a,b) => b.risk - a.risk);
    highRiskSpots.forEach(spot => {
        alertContainer.innerHTML += `
            <div class="bg-rose-50 dark:bg-rose-900/10 p-4 rounded-lg border border-rose-100 dark:border-rose-900/50">
                <div class="flex justify-between items-center mb-1">
                    <h4 class="font-bold text-rose-700 dark:text-rose-400">${spot.name}</h4>
                    <span class="text-xs bg-rose-600 text-white px-2 py-0.5 rounded font-bold">Risk: ${spot.risk}</span>
                </div>
                <p class="text-xs text-rose-600/80 dark:text-rose-300/80">${spot.reports} recent incidents reported.</p>
            </div>`;
    });
}

window.onload = initMap;
