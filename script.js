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
let isRouteCollapsed = false;

let openMenuId = null; 
let feedbackRating = 0;
let currentUser = null; 
let loginType = 'general';

const hotspots = [
    { name: 'FEU Tech & Main', lat: 14.6040, lng: 120.9875, risk: 90, spread: 0.005, reports: 45 },
    { name: 'UST España Blvd', lat: 14.6096, lng: 120.9894, risk: 85, spread: 0.007, reports: 40 },
    { name: 'SM San Lazaro', lat: 14.6155, lng: 120.9841, risk: 78, spread: 0.006, reports: 35 },
    { name: 'LRT Tayuman', lat: 14.6168, lng: 120.9825, risk: 82, spread: 0.004, reports: 25 },
    { name: 'Cubao Center', lat: 14.6186, lng: 121.0526, risk: 68, spread: 0.015, reports: 20 }
];

let mockReports = [];

hotspots.forEach(spot => {
    for(let i=0; i<spot.reports; i++) {
        const types = ['Harassment/Aggression', 'Crowd/Atmosphere', 'Environmental/Path Hazards', 'Accessibility/Obstructions'];
        const type = types[Math.floor(Math.random() * types.length)];
        mockReports.push({
            id: idCounter++, type: type, title: `${type.split('/')[0]} near ${spot.name.split(' ')[0]}`, desc: `Community report regarding safety at this location. Needs local attention.`,
            cred: Math.floor(Math.random() * 300) + 10, relevance: spot.risk + Math.random() * 30,
            lat: spot.lat + (Math.random() - 0.5) * spot.spread, lng: spot.lng + (Math.random() - 0.5) * spot.spread,
            address: `${spot.name} Area`, privacy: 'approx',
            tags: ['#' + spot.name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '')],
            userVote: 0, timestamp: Date.now() - (Math.random() * 10000000000), 
            comments: Math.random() > 0.6 ? [{text: "Noted, thank you for sharing.", isMine: false}] : [],
            isMine: false
        });
    }
});

document.addEventListener('click', (e) => {
    if(openMenuId) {
        const menu = document.getElementById(`menu-${openMenuId}`);
        if(menu && !menu.contains(e.target)) { menu.classList.add('hidden'); openMenuId = null; }
    }
    const topMenu = document.getElementById('top-nav-menu');
    if(topMenu && !topMenu.contains(e.target) && e.target.id !== 'theme-icon') {
        topMenu.classList.add('hidden');
    }
    const userMenu = document.getElementById('user-dropdown');
    if(userMenu && !userMenu.contains(e.target) && e.target.id !== 'user-avatar-btn') {
        userMenu.classList.add('hidden');
    }
});

function toggleTopMenu(e) {
    e.stopPropagation();
    document.getElementById('top-nav-menu').classList.toggle('hidden');
}

function toggleUserMenu(e) {
    e.stopPropagation();
    document.getElementById('user-dropdown').classList.toggle('hidden');
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView(manilaCenter, 14);
    mapTilesLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    mapTilesDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    
    if(document.documentElement.classList.contains('dark')) mapTilesDark.addTo(map);
    else mapTilesLight.addTo(map);

    populateHeatmap();
    renderReports();
    lucide.createIcons();
    updateAuthUI();
    setTimeout(setupDrag, 500); 
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
    } catch(e) { return 'Network error fetching street name.'; }
}

function populateHeatmap() {
    if(heatmapLayer) map.removeLayer(heatmapLayer);
    
    let filteredData = mockReports;
    if(isRadiusActive && radiusCenterCoords) {
        filteredData = mockReports.filter(r => getDistance(radiusCenterCoords[0], radiusCenterCoords[1], r.lat, r.lng) <= 1.0);
    }

    let heatData = filteredData.map(r => [r.lat, r.lng, r.cred / 80]); 
    filteredData.forEach(r => {
        for(let i=0; i<4; i++) { heatData.push([r.lat + (Math.random()-0.5)*0.0015, r.lng + (Math.random()-0.5)*0.0015, Math.random() * 0.5]); }
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
        btn.innerHTML = `<i data-lucide="crosshair" class="w-3 h-3"></i> Focus 1km`;
        btn.classList.replace('bg-rose-600', 'bg-indigo-600');
        infoBox.classList.add('hidden');
        populateHeatmap();
        lucide.createIcons();
    } else {
        showToast("Click any location on the map to set 1km focus area.", "success");
        document.getElementById('map').style.cursor = 'crosshair';
        
        map.once('click', async function(e) {
            document.getElementById('map').style.cursor = '';
            radiusCenterCoords = [e.latlng.lat, e.latlng.lng];
            isRadiusActive = true;
            
            if(radiusCircle) map.removeLayer(radiusCircle);
            radiusCircle = L.circle(radiusCenterCoords, {radius: 1000, color: '#4f46e5', fillOpacity: 0.1, weight: 2}).addTo(map);
            
            btn.innerHTML = `<i data-lucide="x" class="w-3 h-3"></i> Clear 1km`; 
            btn.classList.replace('bg-indigo-600', 'bg-rose-600');

            infoBox.innerHTML = `<i>Fetching location...</i>`;
            infoBox.classList.remove('hidden');
            const address = await getAddressFromCoords(radiusCenterCoords[0], radiusCenterCoords[1]);
            infoBox.innerHTML = `<b>1km Radius Focus</b><br><span class="text-[10px] opacity-80 line-clamp-2">${address}</span>`;
            populateHeatmap();
            lucide.createIcons();
        });
    }
}

function updateOpacity() {
    const val = document.getElementById('heatmap-opacity').value;
    if(heatmapLayer && heatmapLayer._canvas) {
        heatmapLayer._canvas.style.opacity = val;
    }
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

// --- FIX: Sidebar Collapse Logic + InvalidateSize ---
let sidebarCollapsed = false;
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    const sidebar = document.getElementById('user-sidebar');
    const expanded = document.getElementById('sidebar-expanded');
    const collapsed = document.getElementById('sidebar-collapsed');

    if(sidebarCollapsed) {
        // Apply tailwind classes for collapsed state
        sidebar.classList.replace('md:w-[460px]', 'md:w-16');
        sidebar.classList.replace('sm:w-[380px]', 'sm:w-16');
        sidebar.classList.replace('w-11/12', 'w-16');
        
        expanded.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => {
            expanded.classList.add('hidden');
            collapsed.classList.remove('hidden');
            collapsed.classList.add('flex');
            setTimeout(() => collapsed.classList.replace('opacity-0', 'opacity-100'), 50);
            map.invalidateSize(); // Fix map rendering bug
            setupDrag(); // Re-calc bounds
        }, 300);
    } else {
        // Expand
        sidebar.classList.replace('md:w-16', 'md:w-[460px]');
        sidebar.classList.replace('sm:w-16', 'sm:w-[380px]');
        sidebar.classList.replace('w-16', 'w-11/12');
        
        collapsed.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => {
            collapsed.classList.add('hidden');
            collapsed.classList.remove('flex');
            expanded.classList.remove('hidden');
            setTimeout(() => expanded.classList.replace('opacity-0', 'opacity-100'), 50);
            map.invalidateSize(); // Fix map rendering bug
            setupDrag();
        }, 300);
    }
}

function toggleRouteCollapse() {
    isRouteCollapsed = !isRouteCollapsed;
    const body = document.getElementById('route-panel-body');
    const icon = document.querySelector('#route-collapse-btn i');
    if(isRouteCollapsed) {
        body.classList.add('hidden');
        icon.setAttribute('data-lucide', 'chevron-down');
    } else {
        body.classList.remove('hidden');
        icon.setAttribute('data-lucide', 'chevron-up');
    }
    lucide.createIcons();
    setTimeout(setupDrag, 100); 
}

// --- Login Flow ---
function openLoginOverlay() {
    document.getElementById('login-modal').classList.remove('hidden');
    document.getElementById('login-step-1').classList.remove('hidden');
    document.getElementById('login-step-2').classList.add('hidden');
}
function closeLoginOverlay() { document.getElementById('login-modal').classList.add('hidden'); }
function backToLoginSelect() {
    document.getElementById('login-step-2').classList.add('hidden');
    document.getElementById('login-step-1').classList.remove('hidden');
}

function showLoginForm(type) {
    loginType = type;
    document.getElementById('login-step-1').classList.add('hidden');
    document.getElementById('login-step-2').classList.remove('hidden');
    
    const container = document.getElementById('login-fields-container');
    const title = document.getElementById('login-form-title');
    
    if(type === 'general') {
        title.innerText = "General User Login";
        container.innerHTML = `<input type="text" id="login-email" placeholder="Username or Email" class="input-base" value="user@mail.com"><input type="password" placeholder="Password" class="input-base" value="password">`;
    } else {
        title.innerText = "Partner Agency Login";
        container.innerHTML = `<input type="text" id="login-email" placeholder="Official Email" class="input-base" value="agency@ncr.gov.ph"><input type="text" placeholder="Employee ID" class="input-base" value="EMP-4029"><input type="password" placeholder="Password" class="input-base" value="password">`;
    }
}

function executeLogin() {
    const email = document.getElementById('login-email').value;
    if(!email) return showToast("Please enter valid credentials", "error");
    currentUser = { type: loginType, email: email };
    closeLoginOverlay();
    updateAuthUI();
    showToast(`Logged in successfully.`, "success");
}

function logoutUser() {
    currentUser = null;
    document.getElementById('user-dropdown').classList.add('hidden');
    updateAuthUI();
    showToast("Successfully logged out.", "success");
}

function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const userContainer = document.getElementById('user-menu-container');
    const avatarBtn = document.getElementById('user-avatar-btn');
    const dropdown = document.getElementById('user-dropdown');
    
    if(!currentUser) {
        loginBtn.classList.remove('hidden');
        userContainer.classList.add('hidden');
    } else {
        loginBtn.classList.add('hidden');
        userContainer.classList.remove('hidden');
        
        const colorClass = currentUser.type === 'partner' ? 'bg-emerald-500 hover:bg-emerald-600 border-emerald-400' : 'bg-indigo-500 hover:bg-indigo-600 border-indigo-400';
        const iconName = currentUser.type === 'partner' ? 'building' : 'user';
        avatarBtn.className = `w-10 h-10 flex items-center justify-center text-white rounded-full shadow-md border transition ${colorClass}`;
        avatarBtn.innerHTML = `<i data-lucide="${iconName}" class="w-5 h-5"></i>`;
        
        const typeLabelColor = currentUser.type === 'partner' ? 'text-emerald-500' : 'text-indigo-500';
        const typeLabelText = currentUser.type === 'partner' ? 'Partner Agency' : 'General Account';
        
        dropdown.innerHTML = `
            <div class="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 min-w-0">
                <p class="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold mb-0.5">Signed in as</p>
                <p class="text-sm font-bold text-slate-800 dark:text-white truncate" title="${currentUser.email}">${currentUser.email}</p>
                <p class="text-[10px] uppercase tracking-wider font-bold ${typeLabelColor} mt-1 truncate">${typeLabelText}</p>
            </div>
            <button onclick="showToast('Account settings opening...', 'success')" class="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold border-b border-slate-100 dark:border-slate-700/50 whitespace-nowrap"><i data-lucide="settings" class="w-4 h-4"></i> Account Settings</button>
            <button onclick="logoutUser()" class="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold whitespace-nowrap"><i data-lucide="log-out" class="w-4 h-4"></i> Logout</button>
        `;
        lucide.createIcons();
    }
}

// Feedback System
function hoverRating(val) {
    document.querySelectorAll('.star-icon').forEach(s => {
        if(parseInt(s.dataset.value) <= val) { s.innerHTML = '<i data-lucide="star" class="w-8 h-8 fill-yellow-400 text-yellow-400"></i>'; } 
        else { s.innerHTML = '<i data-lucide="star" class="w-8 h-8 text-slate-300 dark:text-slate-600"></i>'; }
    });
    lucide.createIcons();
}
function resetRating() { hoverRating(feedbackRating); }
function setRating(val) { feedbackRating = val; hoverRating(val); }
function openFeedbackModal() { document.getElementById('feedback-modal').classList.remove('hidden'); }
function closeFeedbackModal() { document.getElementById('feedback-modal').classList.add('hidden'); }
function submitFeedback() {
    const text = document.getElementById('feedback-text').value;
    if(feedbackRating === 0) return showToast("Please select a star rating.", "error");
    if(!text.trim()) return showToast("Feedback cannot be empty.", "error");
    document.getElementById('feedback-text').value = '';
    feedbackRating = 0; resetRating();
    closeFeedbackModal(); showToast("Feedback sent! Thank you.", "success");
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
    if(!currentUser) return showToast("Please log in first to perform this action.", "error");
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
        pinStatus.innerHTML = `<i>Fetching precise address...</i>`;
        const address = await getAddressFromCoords(customPinCoords[0], customPinCoords[1]);
        pinStatus.innerHTML = `<b>Pinned Location:</b> ${address}<br><span class="text-[10px] text-slate-500 font-normal truncate block mt-1">Lat: ${customPinCoords[0].toFixed(5)}, Lng: ${customPinCoords[1].toFixed(5)}</span>`;
    });
}

// FIX: Safe Dragging Constraints for Route Panel
function setupDrag() {
    const dragItem = document.getElementById("route-panel");
    const dragHeader = document.getElementById("route-panel-header");
    const mapContainer = document.getElementById('map-container');
    
    if(!mapContainer || !dragItem || !dragHeader) return;

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
            
            const mapRect = mapContainer.getBoundingClientRect();
            const panelRect = dragItem.getBoundingClientRect();
            
            const minX = 24; 
            const maxX = mapRect.width - panelRect.width - 24;
            // Pad 24px from top and bottom boundaries explicitly
            const minY = 24; 
            const maxY = mapRect.height - panelRect.height - 24;

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

// Toast handles text truncation properly
function showToast(msg, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colorClass = type === 'error' ? 'bg-rose-500' : 'bg-emerald-500';
    const icon = type === 'error' ? '<i data-lucide="alert-circle" class="w-5 h-5 shrink-0"></i>' : '<i data-lucide="check-circle" class="w-5 h-5 shrink-0"></i>';
    toast.className = `${colorClass} text-white px-6 py-3 rounded-lg shadow-2xl font-bold text-sm transform transition-all duration-300 translate-y-[-20px] opacity-0 flex items-center gap-3 z-[100000] pointer-events-auto`;
    toast.innerHTML = `${icon} <span class="break-words w-full">${msg}</span>`;
    container.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => { toast.classList.remove('translate-y-[-20px]', 'opacity-0'); }, 10);
    setTimeout(() => { toast.classList.add('opacity-0'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function toggleDarkMode() {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    if(html.classList.contains('dark')) {
        html.classList.remove('dark'); map.removeLayer(mapTilesDark); mapTilesLight.addTo(map);
        icon.innerHTML = `<i data-lucide="moon" class="w-4 h-4"></i>`;
    } else {
        html.classList.add('dark'); map.removeLayer(mapTilesLight); mapTilesDark.addTo(map);
        icon.innerHTML = `<i data-lucide="sun" class="w-4 h-4"></i>`;
    }
    lucide.createIcons();
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
            <div class="flex flex-col items-center justify-center py-12 text-center opacity-80 text-slate-500">
                <i data-lucide="inbox" class="w-12 h-12 mb-3"></i>
                <p class="text-sm font-bold">No matching reports found.</p>
            </div>`;
        lucide.createIcons(); return;
    }
    
    reportsToRender.forEach(report => {
        let typeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';
        if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 border-rose-100';
        if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 border-amber-100';
        if(report.type.includes('Accessibility')) typeColor = 'text-purple-600 bg-purple-50 border-purple-100';

        let menuItems = `<button onclick="event.stopPropagation(); shareReport(${report.id})" class="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold whitespace-nowrap"><i data-lucide="link" class="w-3 h-3 shrink-0"></i> Share</button>`;
        if(report.isMine) {
            menuItems += `
                <button onclick="event.stopPropagation(); editReportDesc(event, ${report.id})" class="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold whitespace-nowrap"><i data-lucide="edit-2" class="w-3 h-3 shrink-0"></i> Edit</button>
                <button onclick="event.stopPropagation(); deleteReport(${report.id})" class="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold whitespace-nowrap"><i data-lucide="trash-2" class="w-3 h-3 shrink-0"></i> Delete</button>
            `;
        } else {
            menuItems += `<button onclick="event.stopPropagation(); openFlagModal(${report.id})" class="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold whitespace-nowrap"><i data-lucide="flag" class="w-3 h-3 shrink-0"></i> Report</button>`;
        }

        const actionBtn = `
            <div class="relative inline-block text-left" onclick="event.stopPropagation()">
                <button onclick="toggleReportMenu(event, ${report.id})" class="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-full"><i data-lucide="more-vertical" class="w-4 h-4"></i></button>
                <div id="menu-${report.id}" class="hidden absolute right-0 mt-1 w-32 glass-panel rounded-md shadow-lg z-50 overflow-hidden"><div class="py-1">${menuItems}</div></div>
            </div>`;

        const tagHTML = report.tags.map(t => `<span class="badge bg-slate-100 dark:bg-slate-700 text-slate-500">${t}</span>`).join('');
        const upBtnStyle = report.userVote === 1 ? "text-emerald-500 scale-110" : "text-slate-400 hover:text-emerald-500";
        const downBtnStyle = report.userVote === -1 ? "text-rose-500 scale-110" : "text-slate-400 hover:text-rose-500";
        const privStyle = report.privacy === 'precise' ? 'text-rose-500' : 'text-indigo-500';

        list.innerHTML += `
            <div onclick="openDetailModal(${report.id})" class="report-card group cursor-pointer min-w-0">
                <div class="absolute top-3 right-3 z-20">${actionBtn}</div>
                <div class="mb-2 flex items-center gap-2 pr-6 min-w-0">
                    <span class="badge ${typeColor} shrink-0">${report.type.split('/')[0]}</span>
                    <span class="text-[10px] text-slate-400 font-medium truncate">${formatDate(report.timestamp)}</span>
                </div>
                <h3 class="font-bold text-slate-800 dark:text-white text-sm mb-2 pr-6 truncate" title="${report.title}">${report.title}</h3>
                <div class="mb-3 p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400 min-w-0">
                    <p class="font-bold flex items-center justify-between mb-1 min-w-0">
                        <span class="truncate mr-2 text-slate-700 dark:text-slate-300 flex items-center gap-1 shrink"><i data-lucide="map-pin" class="w-3 h-3 shrink-0 text-indigo-500"></i> <span class="truncate">${report.address}</span></span>
                        <span class="uppercase tracking-wider whitespace-nowrap shrink-0 ${privStyle}">${report.privacy === 'precise' ? 'Precise Pin' : 'Area Report'}</span>
                    </p>
                    <p class="mt-0.5 ml-4 truncate">Coords: ${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}</p>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-300 mb-3 line-clamp-2 leading-relaxed">${report.desc}</p>
                <div class="flex flex-wrap gap-1.5 mb-3">${tagHTML}</div>
                <div class="flex justify-between items-center border-t border-slate-100 dark:border-slate-700 pt-3">
                    <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5"><i data-lucide="message-square" class="w-3.5 h-3.5"></i> ${report.comments.length}</span>
                    <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700" onclick="event.stopPropagation()">
                        <button onclick="voteReport(${report.id}, 1)" class="transition-transform ${upBtnStyle}"><i data-lucide="arrow-up" class="w-4 h-4"></i></button>
                        <span class="font-bold text-sm text-slate-700 dark:text-slate-200 w-6 text-center">${report.cred}</span>
                        <button onclick="voteReport(${report.id}, -1)" class="transition-transform ${downBtnStyle}"><i data-lucide="arrow-down" class="w-4 h-4"></i></button>
                    </div>
                </div>
            </div>`;
    });
    lucide.createIcons();
}

function openFlagModal(id) {
    if(!currentUser) return showToast("Please log in first to perform this action.", "error");
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
    if(!currentUser) return showToast("Please log in first to perform this action.", "error");
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
            <span class="badge bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${report.type}</span>
            <span class="text-xs text-slate-400 font-medium truncate">${formatDate(report.timestamp)}</span>
        </div>
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-4 pr-4">${report.title}</h2>
        <div class="mb-4 p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 leading-relaxed min-w-0">
            <p class="font-bold flex items-center justify-between mb-1 border-b border-slate-200 dark:border-slate-700 pb-1 min-w-0">
                <span class="text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate mr-2"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-indigo-500 shrink-0"></i> <span class="truncate">${report.address}</span></span>
                <span class="uppercase tracking-wider whitespace-nowrap shrink-0 ${privStyle}">${report.privacy === 'precise' ? 'Precise Pin' : 'Area Report'}</span>
            </p>
            <p class="ml-5 truncate">Coordinates: ${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}</p>
        </div>
        <p class="text-sm text-slate-700 dark:text-slate-300 mb-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg leading-relaxed border border-slate-100 dark:border-slate-700/50">${report.desc}</p>
    `;
    
    const cList = document.getElementById('detail-comments');
    cList.innerHTML = report.comments.length ? '' : '<p class="text-sm text-slate-400">No comments yet.</p>';
    report.comments.forEach((c, idx) => {
        cList.innerHTML += `<div class="bg-slate-50 dark:bg-slate-800 p-3.5 rounded-lg text-sm flex justify-between items-start border border-slate-100 dark:border-slate-700 gap-4"><p class="text-slate-800 dark:text-slate-200">${c.text}</p></div>`;
    });
    document.getElementById('report-detail-modal').classList.remove('hidden');
    lucide.createIcons();
}
function closeDetailModal() { document.getElementById('report-detail-modal').classList.add('hidden'); }

function submitComment() {
    if(!currentUser) return showToast("Please log in first to perform this action.", "error");
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

function openReportModal() { 
    if(!currentUser) return showToast("Please log in first to perform this action.", "error");
    document.getElementById('report-modal').classList.remove('hidden'); 
}

function closeReportModal() { 
    document.getElementById('report-modal').classList.add('hidden'); 
    if(customPinMarker) { map.removeLayer(customPinMarker); customPinMarker = null; customPinCoords = null; }
}

async function submitReport() {
    if(!currentUser) return showToast("Please log in first to perform this action.", "error");

    const title = document.getElementById('report-title').value.trim();
    const cat = document.getElementById('report-category').value;
    const desc = document.getElementById('report-desc').value.trim();
    const privacy = document.getElementById('loc-privacy').value;
    
    if(!title || !cat) return showToast("Please fill all required fields.", "error");
    if(desc.length < 15) return showToast("Description must be at least 15 characters.", "error");

    const aiError = aiContentCheck(desc) || aiContentCheck(title);
    if(aiError) return showToast(`AI Flag: ${aiError}`, "error");

    let finalLat = manilaCenter[0] + (Math.random() - 0.5) * 0.01;
    let finalLng = manilaCenter[1] + (Math.random() - 0.5) * 0.01;
    if (privacy === 'precise' && customPinCoords) { finalLat = customPinCoords[0]; finalLng = customPinCoords[1]; }

    const address = await getAddressFromCoords(finalLat, finalLng);

    mockReports.unshift({
        id: idCounter++, type: cat, title: title, desc: desc, cred: 1, relevance: 100, timestamp: Date.now(),
        lat: finalLat, lng: finalLng, address: address, privacy: privacy, tags: [...currentTags], comments: [], userVote: 1, isMine: true
    });

    document.getElementById('report-title').value = ''; document.getElementById('report-desc').value = '';
    closeReportModal(); populateHeatmap(); filterReports(); currentTags = []; 
    document.getElementById('emergency-modal').classList.remove('hidden');
}

function closeEmergencyModal() { document.getElementById('emergency-modal').classList.add('hidden'); }

function suggestTags() {
    const title = document.getElementById('report-title').value.toLowerCase();
    const cat = document.getElementById('report-category').value;
    const container = document.getElementById('tag-container');
    const aiTags = document.getElementById('ai-tags');
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
        `<span class="badge bg-white text-indigo-600 border border-indigo-200 cursor-pointer hover:bg-indigo-50" onclick="addTag('${tag}')">${tag} <i data-lucide="plus" class="w-3 h-3 inline"></i></span>`
    ).join('');
    lucide.createIcons();
}

function handleTagKeypress(e) { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }
function addCustomTag() {
    let val = document.getElementById('custom-tag-input').value.trim().replace(/\s+/g, '_');
    if(val) { if(!val.startsWith('#')) val = '#' + val; addTag(val.toLowerCase()); document.getElementById('custom-tag-input').value = ''; }
}
function addTag(tag) {
    if(!currentTags.includes(tag) && currentTags.length < 5) {
        currentTags.push(tag);
        document.getElementById('active-tags-container').innerHTML = currentTags.map(t => `<span class="badge bg-indigo-600 text-white">${t} <button onclick="removeTag('${t}')" class="hover:text-rose-300 ml-1"><i data-lucide="x" class="w-3 h-3"></i></button></span>`).join('');
        lucide.createIcons();
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
                li.className = "p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 dark:text-slate-200 text-slate-700 flex items-center gap-2 truncate";
                li.innerHTML = `<i data-lucide="map-pin" class="w-4 h-4 text-slate-400 shrink-0"></i> <span class="truncate">${item.display_name}</span>`;
                li.onclick = () => {
                    inputEl.value = item.display_name.split(',')[0];
                    resultsUl.classList.add('hidden');
                    if(target === 'start') startCoords = [parseFloat(item.lat), parseFloat(item.lon)];
                    if(target === 'end') endCoords = [parseFloat(item.lat), parseFloat(item.lon)];
                };
                resultsUl.appendChild(li);
            });
            resultsUl.classList.remove('hidden');
            lucide.createIcons();
        } catch(e) {}
    }, 500); 
}

async function calculateRealRoute() {
    const btn = document.getElementById('route-btn');
    if(!startCoords || !endCoords) return showToast("Select Start and Destination from suggestions.", "error");

    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline shrink-0"></i> Finding paths...`; 
    btn.disabled = true; lucide.createIcons();

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
                streetList.innerHTML += `<li class="flex items-center gap-2"><i data-lucide="arrow-right-circle" class="w-3 h-3 text-indigo-400 shrink-0"></i> ${step.name}</li>`;
                lastStreet = step.name;
            }
        });

        document.getElementById('route-details').classList.remove('hidden');
        document.getElementById('clear-route-btn').classList.remove('hidden');
        document.getElementById('route-dist').innerHTML = `<i data-lucide="footprints" class="w-4 h-4 shrink-0"></i> ${distKm} km`;
        document.getElementById('route-time').innerHTML = `<i data-lucide="clock" class="w-4 h-4 shrink-0"></i> ${timeMin} mins`;
        setTimeout(setupDrag, 100);
    } catch (e) { showToast("Error calculating route.", "error"); }
    btn.innerHTML = `<i data-lucide="route" class="w-4 h-4 shrink-0"></i> Calculate Route`; 
    btn.disabled = false; lucide.createIcons();
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

// Omitted Partner Portal UI functions to preserve bounds, logic identical to previous code block.
window.onload = initMap;
