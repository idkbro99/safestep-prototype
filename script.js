const manilaCenter = [14.6060, 120.9870]; 
let map, heatmapLayer, routingLine;
let mapTilesLight, mapTilesDark;

let activeFilter = 'all';
let activeSort = 'relevant';
let activeDetailId = null;
let currentTags = [];
let idCounter = 1;

let isRadiusActive = false;
let radiusCenterCoords = null;
let radiusCircle = null;

let isPickingLocation = false;
let customPinCoords = null;
let customPinMarker = null;

let searchTimeout;
let startCoords = null, endCoords = null;
let isDragging = false, currentX=0, currentY=0, initialX=0, initialY=0, xOffset = 0, yOffset = 0;

let openMenuId = null; // Track open Kebab menus
let feedbackRating = 0;

const citySummaries = [
    { name: 'City of Manila', risk: 82 }, { name: 'Quezon City', risk: 65 },
    { name: 'Caloocan City', risk: 70 }, { name: 'Makati City', risk: 25 },
    { name: 'Taguig City', risk: 18 }, { name: 'Pasay City', risk: 85 }
];

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
            address: `${spot.name} Area, Metro Manila`, privacy: 'approx',
            tags: ['#' + spot.name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '')],
            userVote: 0, timestamp: Date.now() - (Math.random() * 10000000000), 
            comments: Math.random() > 0.6 ? [{text: "Noted, thank you for sharing.", isMine: false}] : [],
            isMine: false
        });
    }
});

// Close open menus globally
document.addEventListener('click', () => {
    if(openMenuId) {
        const menu = document.getElementById(`menu-${openMenuId}`);
        if(menu) menu.classList.add('hidden');
        openMenuId = null;
    }
    const topMenu = document.getElementById('top-nav-menu');
    if(!topMenu.classList.contains('hidden')) topMenu.classList.add('hidden');
});

function toggleTopMenu(e) {
    e.stopPropagation();
    document.getElementById('top-nav-menu').classList.toggle('hidden');
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView(manilaCenter, 14);

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

async function getAddressFromCoords(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await res.json();
        return data.display_name || 'Location recognized from coordinates.';
    } catch(e) {
        return 'Network error fetching street name.';
    }
}

function populateHeatmap() {
    if(heatmapLayer) map.removeLayer(heatmapLayer);
    
    let filteredData = mockReports;
    if(isRadiusActive && radiusCenterCoords) {
        filteredData = mockReports.filter(r => getDistance(radiusCenterCoords[0], radiusCenterCoords[1], r.lat, r.lng) <= 1.0);
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
    const infoBox = document.getElementById('radius-info');

    if(isRadiusActive) {
        isRadiusActive = false;
        if(radiusCircle) map.removeLayer(radiusCircle);
        btn.innerHTML = "📍 Focus 1km Area";
        btn.classList.replace('bg-rose-600', 'bg-indigo-600');
        infoBox.classList.add('hidden');
        populateHeatmap();
        showToast("Showing all NCR data.", "success");
    } else {
        showToast("Click any location on the map to set 1km focus area.", "success");
        document.getElementById('map').style.cursor = 'crosshair';
        
        map.once('click', async function(e) {
            document.getElementById('map').style.cursor = '';
            radiusCenterCoords = [e.latlng.lat, e.latlng.lng];
            isRadiusActive = true;
            
            if(radiusCircle) map.removeLayer(radiusCircle);
            radiusCircle = L.circle(radiusCenterCoords, {radius: 1000, color: '#4f46e5', fillOpacity: 0.1, weight: 2}).addTo(map);
            
            btn.innerHTML = "✕ Clear 1km Focus"; 
            btn.classList.replace('bg-indigo-600', 'bg-rose-600');

            infoBox.innerHTML = `📍 <i>Fetching location...</i>`;
            infoBox.classList.remove('hidden');
            const address = await getAddressFromCoords(radiusCenterCoords[0], radiusCenterCoords[1]);
            infoBox.innerHTML = `📍 <b>1km Radius Focus</b><br><span class="text-[10px] opacity-80">${address}</span>`;

            populateHeatmap();
        });
    }
}

function updateOpacity() {
    const val = document.getElementById('heatmap-opacity').value;
    const canvases = document.querySelectorAll('.leaflet-heatmap-layer');
    canvases.forEach(c => c.style.opacity = val);
}

function aiContentCheck(text) {
    if(!text) return "Input cannot be empty.";
    const badWords = ['gago', 'puta', 'bobo', 'shit', 'fuck', 'spam', 'asshole'];
    const lower = text.toLowerCase();
    if(badWords.some(bw => lower.includes(bw))) return "Inappropriate language detected. Request denied.";
    if(/(.)\1{4,}/.test(text)) return "Gibberish or repetitive spam detected.";
    if(text.length > 25 && !/\s/.test(text)) return "Invalid text format (missing spaces).";
    return null;
}

// --- Dynamic Sidebar Toggle ---
function toggleSidebar() {
    const sidebar = document.getElementById('user-sidebar');
    const expanded = document.getElementById('sidebar-expanded-content');
    const collapsed = document.getElementById('sidebar-collapsed-content');
    
    // Toggle width classes
    sidebar.classList.toggle('w-[460px]');
    sidebar.classList.toggle('w-12');
    
    if(sidebar.classList.contains('w-12')) {
        expanded.classList.add('hidden');
        collapsed.classList.remove('hidden');
        collapsed.classList.add('flex');
    } else {
        expanded.classList.remove('hidden');
        collapsed.classList.add('hidden');
        collapsed.classList.remove('flex');
    }
    
    // Recalculate map bounds for panel dragging
    setTimeout(setupDrag, 350);
}

// --- Login Flow ---
function showLoginToast() {
    // Reusing the toast container to mock a quick prompt
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white px-6 py-4 rounded-lg shadow-2xl font-bold text-sm transform transition-all duration-300 translate-y-[-20px] opacity-0 flex flex-col gap-3 z-[100000] pointer-events-auto`;
    toast.innerHTML = `
        <p class="text-center">Select Account Type</p>
        <div class="flex gap-2">
            <button onclick="loginGeneral(this)" class="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-4 py-2 rounded hover:bg-indigo-200 transition">General User</button>
            <button onclick="loginPartner(this)" class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition">Partner Agency</button>
        </div>
    `;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.remove('translate-y-[-20px]', 'opacity-0'); }, 10);
}
function loginGeneral(btn) {
    btn.parentElement.parentElement.remove();
    showToast("Logged in as General User.", "success");
}
function loginPartner(btn) {
    btn.parentElement.parentElement.remove();
    togglePortal();
}

// --- Feedback System ---
function hoverRating(val) {
    document.querySelectorAll('.star').forEach(s => {
        if(parseInt(s.dataset.value) <= val) { s.innerHTML = '★'; s.classList.add('text-yellow-400', 'dark:text-yellow-400'); } 
        else { s.innerHTML = '☆'; s.classList.remove('text-yellow-400', 'dark:text-yellow-400'); }
    });
}
function resetRating() {
    hoverRating(feedbackRating);
}
function setRating(val) {
    feedbackRating = val;
    hoverRating(val);
}
function openFeedbackModal() { document.getElementById('feedback-modal').classList.remove('hidden'); }
function closeFeedbackModal() { document.getElementById('feedback-modal').classList.add('hidden'); }
function submitFeedback() {
    const text = document.getElementById('feedback-text').value;
    if(feedbackRating === 0) return showToast("Please select a star rating.", "error");
    if(!text.trim()) return showToast("Feedback cannot be empty.", "error");
    
    document.getElementById('feedback-text').value = '';
    feedbackRating = 0; resetRating();
    closeFeedbackModal();
    showToast("Feedback sent! Thank you.", "success");
}

function swapRoute() {
    const startInput = document.getElementById('route-start');
    const endInput = document.getElementById('route-end');
    
    const tempVal = startInput.value;
    startInput.value = endInput.value;
    endInput.value = tempVal;
    
    const tempCoords = startCoords;
    startCoords = endCoords;
    endCoords = tempCoords;
    
    if(startCoords && endCoords) calculateRealRoute();
}

function enableMapPicker() {
    closeReportModal();
    showToast("Click anywhere on the map to drop a pin.", "success");
    document.getElementById('map').style.cursor = 'crosshair';
    isPickingLocation = true;
    
    map.once('click', async function(e) {
        isPickingLocation = false;
        document.getElementById('map').style.cursor = '';
        customPinCoords = [e.latlng.lat, e.latlng.lng];
        
        if(customPinMarker) map.removeLayer(customPinMarker);
        customPinMarker = L.marker(customPinCoords).addTo(map);
        
        openReportModal();
        document.getElementById('loc-privacy').value = 'precise';
        
        const pinStatus = document.getElementById('pin-status');
        pinStatus.classList.remove('hidden');
        pinStatus.innerHTML = `📍 <i>Fetching precise address...</i>`;
        
        const address = await getAddressFromCoords(customPinCoords[0], customPinCoords[1]);
        pinStatus.innerHTML = `📍 <b>Pinned Location:</b> ${address}<br><span class="text-[10px] text-slate-500 font-normal">Lat: ${customPinCoords[0].toFixed(5)}, Lng: ${customPinCoords[1].toFixed(5)}</span>`;
    });
}

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
            
            const mapContainer = document.getElementById('map-container');
            const mapRect = mapContainer.getBoundingClientRect();
            const panelRect = dragItem.getBoundingClientRect();
            
            // Constrain strictly within the visual map container bounds
            const minX = 10; 
            const maxX = mapRect.width - panelRect.width - 10;
            const minY = 64; // Respect Header and top badges
            const maxY = mapRect.height - panelRect.height - 10;

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
    toast.className = `${colorClass} text-white px-6 py-3 rounded-lg shadow-2xl font-bold text-sm transform transition-all duration-300 translate-y-[-20px] opacity-0 flex items-center gap-2 pointer-events-auto`;
    toast.innerHTML = type === 'error' ? `<span>⚠️</span> ${msg}` : `<span>✅</span> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.remove('translate-y-[-20px]', 'opacity-0'); }, 10);
    setTimeout(() => { toast.classList.add('opacity-0'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function toggleDarkMode() {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    if(html.classList.contains('dark')) {
        html.classList.remove('dark'); map.removeLayer(mapTilesDark); mapTilesLight.addTo(map);
        icon.innerText = "🌓";
    } else {
        html.classList.add('dark'); map.removeLayer(mapTilesLight); mapTilesDark.addTo(map);
        icon.innerText = "☀️";
    }
    setTimeout(updateOpacity, 100);
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

function toggleReportMenu(e, id) {
    e.stopPropagation();
    if(openMenuId && openMenuId !== id) {
        const existing = document.getElementById(`menu-${openMenuId}`);
        if(existing) existing.classList.add('hidden');
    }
    const menu = document.getElementById(`menu-${id}`);
    menu.classList.toggle('hidden');
    openMenuId = menu.classList.contains('hidden') ? null : id;
}

function shareReport(id) {
    navigator.clipboard.writeText(`Check out this Safety Report on SafeStep: ID#${id}`);
    showToast("Link copied to clipboard!", "success");
    if(openMenuId) { document.getElementById(`menu-${openMenuId}`).classList.add('hidden'); openMenuId = null; }
}

function filterReports() {
    const search = document.getElementById('search-bar').value.toLowerCase();
    let filtered = mockReports.filter(report => {
        const matchCat = activeFilter === 'all' || report.type === activeFilter;
        const matchSearch = report.title.toLowerCase().includes(search) || report.desc.toLowerCase().includes(search);
        const matchRadius = (!isRadiusActive || !radiusCenterCoords) ? true : (getDistance(radiusCenterCoords[0], radiusCenterCoords[1], report.lat, report.lng) <= 1.0); 
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

    if(reportsToRender.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-center opacity-80">
                <span class="text-4xl mb-3">📭</span>
                <p class="text-sm text-slate-500 dark:text-slate-400 font-bold">No matching reports found.</p>
                <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">Try adjusting your search, filters, or clearing the map radius.</p>
            </div>`;
        return;
    }
    
    reportsToRender.forEach(report => {
        let typeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';
        if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 border-rose-100';
        if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 border-amber-100';
        if(report.type.includes('Accessibility')) typeColor = 'text-purple-600 bg-purple-50 border-purple-100';

        let menuItems = `
            <button onclick="event.stopPropagation(); shareReport(${report.id})" class="text-left w-full block px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold">🔗 Share</button>
        `;
        if(report.isMine) {
            menuItems += `
                <button onclick="event.stopPropagation(); editReportDesc(event, ${report.id})" class="text-left w-full block px-4 py-2 text-xs text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold">✏️ Edit</button>
                <button onclick="event.stopPropagation(); deleteReport(${report.id})" class="text-left w-full block px-4 py-2 text-xs text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold">🗑 Delete</button>
            `;
        } else {
            menuItems += `
                <button onclick="event.stopPropagation(); openFlagModal(${report.id})" class="text-left w-full block px-4 py-2 text-xs text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold">🚩 Report</button>
            `;
        }

        const actionBtn = `
            <div class="relative inline-block text-left" onclick="event.stopPropagation()">
                <button onclick="toggleReportMenu(event, ${report.id})" class="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold px-2 py-0.5 text-lg leading-none rounded focus:outline-none transition-colors">⁝</button>
                <div id="menu-${report.id}" class="hidden absolute right-0 mt-1 w-32 rounded-md shadow-lg bg-white dark:bg-slate-800 ring-1 ring-black ring-opacity-5 border border-slate-200 dark:border-slate-700 z-50">
                    <div class="py-1">${menuItems}</div>
                </div>
            </div>
        `;

        const tagHTML = report.tags.map(t => `<span class="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">${t}</span>`).join('');
        const upBtnStyle = report.userVote === 1 ? "text-emerald-500 scale-125" : "text-slate-400 hover:text-emerald-500";
        const downBtnStyle = report.userVote === -1 ? "text-rose-500 scale-125" : "text-slate-400 hover:text-rose-500";
        const privStyle = report.privacy === 'precise' ? 'text-rose-500' : 'text-indigo-500';

        list.innerHTML += `
            <div onclick="openDetailModal(${report.id})" class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 hover:border-indigo-400 cursor-pointer relative group transition-all">
                <div class="absolute top-3 right-3 z-20">${actionBtn}</div>
                
                <div class="mb-2 flex items-center gap-2 pr-6">
                    <span class="text-[10px] font-bold ${typeColor} uppercase tracking-wider px-2 py-1 rounded border inline-block">${report.type.split('/')[0]}</span>
                    <span class="text-[10px] text-slate-400 font-medium">${formatDate(report.timestamp)}</span>
                </div>
                <h3 class="font-bold text-slate-800 dark:text-white text-sm mb-2 pr-6">${report.title}</h3>
                
                <div class="mb-3 p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400">
                    <p class="font-bold flex justify-between">
                        <span class="line-clamp-1 mr-2 text-slate-700 dark:text-slate-300">📍 ${report.address}</span>
                        <span class="uppercase tracking-wider whitespace-nowrap ${privStyle}">${report.privacy === 'precise' ? 'Precise Pin' : 'Area Report'}</span>
                    </p>
                    <p class="mt-0.5">Coords: ${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}</p>
                </div>

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

function editReportDesc(e, id) {
    if(openMenuId) { document.getElementById(`menu-${openMenuId}`).classList.add('hidden'); openMenuId = null; }
    const report = mockReports.find(r => r.id === id);
    const newDesc = prompt("Update your report description:", report.desc);
    
    if(newDesc !== null) {
        const trimmed = newDesc.trim();
        if(trimmed.length < 15) return showToast("Description must be at least 15 characters.", "error");
        
        const aiError = aiContentCheck(trimmed);
        if(aiError) return showToast(`AI Flag: ${aiError}`, "error");
        
        report.desc = trimmed;
        showToast("Report description successfully updated.", "success");
        filterReports();
        if(activeDetailId === id) openDetailModal(id);
    }
}

function editComment(reportId, commentIndex) {
    const report = mockReports.find(r => r.id === reportId);
    const newText = prompt("Edit your comment:", report.comments[commentIndex].text);
    
    if(newText !== null) {
        const trimmed = newText.trim();
        if(trimmed === '') return showToast("Comment cannot be empty.", "error");
        
        const aiError = aiContentCheck(trimmed);
        if(aiError) return showToast(`AI Flag: ${aiError}`, "error");

        report.comments[commentIndex].text = trimmed;
        showToast("Comment successfully updated.", "success");
        openDetailModal(reportId);
        filterReports(); 
    }
}

function deleteReport(id) {
    if(openMenuId) { document.getElementById(`menu-${openMenuId}`).classList.add('hidden'); openMenuId = null; }
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
    if(openMenuId) { document.getElementById(`menu-${openMenuId}`).classList.add('hidden'); openMenuId = null; }
    document.getElementById('flag-reason').value = '';
    document.getElementById('flag-modal').classList.remove('hidden');
}
function closeFlagModal() { document.getElementById('flag-modal').classList.add('hidden'); }
function submitFlag() {
    if(!document.getElementById('flag-reason').value) return showToast("Select a reason.", "error");
    closeFlagModal(); showToast("Report flagged for human review.", "success");
}

function voteReport(id, change) {
    const report = mockReports.find(r => r.id === id);
    if (!report) return;

    if (change === 1) { 
        if (report.userVote === 1) { report.cred--; report.userVote = 0; } 
        else if (report.userVote === -1) { report.cred += 2; report.userVote = 1; } 
        else { report.cred++; report.userVote = 1; } 
    } else if (change === -1) { 
        if (report.userVote === -1) { report.cred++; report.userVote = 0; } 
        else if (report.userVote === 1) { report.cred -= 2; report.userVote = -1; } 
        else { report.cred--; report.userVote = -1; } 
    }
    
    filterReports();
    if(activeDetailId === id) openDetailModal(id);
}

function openDetailModal(id) {
    activeDetailId = id;
    const report = mockReports.find(r => r.id === id);
    const privStyle = report.privacy === 'precise' ? 'text-rose-500' : 'text-indigo-500';

    document.getElementById('detail-content').innerHTML = `
        <div class="flex justify-between items-start mb-3 pr-10">
            <span class="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider px-2 py-1 rounded border border-slate-200 dark:border-slate-700">${report.type}</span>
            <span class="text-xs text-slate-400 font-medium">${formatDate(report.timestamp)}</span>
        </div>
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-4 pr-4">${report.title}</h2>
        
        <div class="mb-4
