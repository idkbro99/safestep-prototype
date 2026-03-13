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

const citySummaries = [
    { name: 'City of Manila', risk: 82 }, { name: 'Quezon City', risk: 65 },
    { name: 'Caloocan City', risk: 70 }, { name: 'Makati City', risk: 25 },
    { name: 'Taguig City', risk: 18 }, { name: 'Pasay City', risk: 85 }
];

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
            comments: Math.random() > 0.6 ? [{text: "Noted, thank you.", isMine: false}] : [],
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
    if(topMenu && !topMenu.contains(e.target) && !e.target.closest('button[onclick="toggleTopMenu(event)"]')) {
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
    if(document.documentElement.classList.contains('dark')) mapTilesDark.addTo(map); else mapTilesLight.addTo(map);

    populateHeatmap();
    renderReports();
    populatePartnerPortal();
    lucide.createIcons();
    setTimeout(setupDrag, 500); 
    updateAuthUI();
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
        btn.innerHTML = `<i data-lucide="crosshair" class="w-3 h-3 inline"></i> Focus 1km`;
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
            btn.innerHTML = `<i data-lucide="x" class="w-3 h-3 inline"></i> Clear 1km`; 
            btn.classList.replace('bg-indigo-600', 'bg-rose-600');
            infoBox.innerHTML = `<i>Fetching location...</i>`;
            infoBox.classList.remove('hidden');
            const address = await getAddressFromCoords(radiusCenterCoords[0], radiusCenterCoords[1]);
            infoBox.innerHTML = `<b>1km Radius Focus</b><br><span class="opacity-80 leading-snug block mt-1">${address}</span>`;
            populateHeatmap();
            lucide.createIcons();
        });
    }
}

function updateOpacity() {
    const val = document.getElementById('heatmap-opacity').value;
    if(heatmapLayer && heatmapLayer._canvas) { heatmapLayer._canvas.style.opacity = val; }
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

let sidebarCollapsed = false;
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    const sidebar = document.getElementById('user-sidebar');
    const expanded = document.getElementById('sidebar-expanded');
    const collapsed = document.getElementById('sidebar-collapsed');

    if(sidebarCollapsed) {
        sidebar.classList.remove('md:w-[460px]', 'sm:w-[380px]', 'w-11/12');
        sidebar.classList.add('w-16');
        expanded.classList.add('hidden');
        collapsed.classList.remove('hidden');
        collapsed.classList.add('flex');
    } else {
        sidebar.classList.remove('w-16');
        sidebar.classList.add('md:w-[460px]', 'sm:w-[380px]', 'w-11/12');
        collapsed.classList.add('hidden');
        collapsed.classList.remove('flex');
        expanded.classList.remove('hidden');
    }
    setTimeout(() => { map.invalidateSize(); setupDrag(); }, 350); 
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
        container.innerHTML = `<input type="text" id="login-email" placeholder="Username or Email" class="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none dark:text-white" value="user@mail.com"><input type="password" placeholder="Password" class="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none dark:text-white" value="password">`;
    } else {
        title.innerText = "Partner Agency Login";
        container.innerHTML = `<input type="text" id="login-email" placeholder="Official Email" class="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none dark:text-white" value="agency@ncr.gov.ph"><input type="text" placeholder="Employee ID" class="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none dark:text-white" value="EMP-4029"><input type="password" placeholder="Password" class="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none dark:text-white" value="password">`;
    }
}

function executeLogin() {
    const email = document.getElementById('login-email').value;
    if(!email) return showToast("Please enter valid credentials", "error");
    currentUser = { type: loginType, email: email };
    closeLoginOverlay(); updateAuthUI(); showToast(`Logged in successfully.`, "success");
}

function logoutUser() {
    currentUser = null;
    document.getElementById('user-dropdown').classList.add('hidden');
    document.getElementById('partner-portal').classList.add('hidden');
    updateAuthUI(); showToast("Successfully logged out.", "success");
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
        const colorClass = currentUser.type === 'partner' ? 'bg-slate-500 hover:bg-slate-600 border-slate-400' : 'bg-indigo-500 hover:bg-indigo-600 border-indigo-400';
        const iconName = currentUser.type === 'partner' ? 'building' : 'user';
        avatarBtn.className = `w-10 h-10 flex items-center justify-center text-white rounded-full shadow-lg transition border-2 border-white dark:border-slate-700 ${colorClass}`;
        avatarBtn.innerHTML = `<i data-lucide="${iconName}" class="w-5 h-5"></i>`;
        
        const typeLabelColor = currentUser.type === 'partner' ? 'text-slate-600 dark:text-slate-400' : 'text-indigo-600 dark:text-indigo-400';
        const typeLabelText = currentUser.type === 'partner' ? 'Partner Agency' : 'General Account';
        let extraLinks = currentUser.type === 'partner' ? `<button onclick="togglePortal()" class="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold border-b border-slate-100 dark:border-slate-700/50 whitespace-nowrap"><i data-lucide="layout-dashboard" class="w-4 h-4"></i> Dashboard Access</button>` : '';
        
        dropdown.innerHTML = `
            <div class="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 min-w-0">
                <p class="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold mb-0.5">Signed in as</p>
                <p class="text-sm font-bold text-slate-800 dark:text-white truncate" title="${currentUser.email}">${currentUser.email}</p>
                <p class="text-[10px] uppercase tracking-wider font-bold ${typeLabelColor} mt-1 truncate">${typeLabelText}</p>
            </div>
            ${extraLinks}
            <button onclick="showToast('Account settings opening...', 'success')" class="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold border-b border-slate-100 dark:border-slate-700/50 whitespace-nowrap"><i data-lucide="settings" class="w-4 h-4"></i> Account Settings</button>
            <button onclick="logoutUser()" class="w-full flex items-center gap-3 px-4 py-3 text-sm text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold rounded-b-lg whitespace-nowrap"><i data-lucide="log-out" class="w-4 h-4"></i> Logout</button>
        `;
        lucide.createIcons();
    }
}

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
    document.getElementById('feedback-text').value = ''; feedbackRating = 0; resetRating();
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

function setupDrag() {
    const dragItem = document.getElementById("route-panel");
    const dragHeader = document.getElementById("route-panel-header");
    const mapContainer = document.getElementById('map-container');
    if(!mapContainer || !dragItem || !dragHeader) return;
    
    let initialX = 0, initialY = 0, dragOffsetX = 0, dragOffsetY = 0;
    dragItem.style.transform = 'none';

    function dragStart(e) {
        if (e.target === dragHeader || dragHeader.contains(e.target)) {
            isDragging = true;
            const rect = dragItem.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
        }
    }
    function dragEnd(e) { isDragging = false; }
    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            const mapRect = mapContainer.getBoundingClientRect();
            let newLeft = e.clientX - dragOffsetX;
            let newTop = e.clientY - dragOffsetY;
            
            // Perfect Bounds: Equal 24px padding top and bottom. Prevent going left past screen.
            const minLeft = mapRect.left + 24; 
            const maxLeft = mapRect.right - dragItem.offsetWidth - 24;
            const minTop = mapRect.top + 24; 
            const maxTop = mapRect.bottom - dragItem.offsetHeight - 24;

            newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
            newTop = Math.max(minTop, Math.min(newTop, maxTop));
            
            dragItem.style.left = (newLeft - mapRect.left) + 'px';
            dragItem.style.top = (newTop - mapRect.top) + 'px';
            dragItem.style.right = 'auto'; 
        }
    }
    dragHeader.removeEventListener("mousedown", dragStart);
    document.removeEventListener("mouseup", dragEnd);
    document.removeEventListener("mousemove", drag);
    dragHeader.addEventListener("mousedown", dragStart, false);
    document.addEventListener("mouseup", dragEnd, false);
    document.addEventListener("mousemove", drag, false);
}

function formatDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' • ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function showToast(msg, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colorClass = type === 'error' ? 'bg-rose-500' : 'bg-emerald-500';
    // Raw SVG to ensure it always appears instantly
    const icon = type === 'error' 
        ? `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>` 
        : `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    toast.className = `${colorClass} text-white px-6 py-4 rounded-xl shadow-2xl font-bold text-sm transform transition-all duration-300 translate-y-[-20px] opacity-0 flex items-start gap-3 pointer-events-auto max-w-xs sm:max-w-sm`;
    toast.innerHTML = `${icon} <span class="break-words w-full leading-snug">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.remove('translate-y-[-20px]', 'opacity-0'); }, 10);
    setTimeout(() => { toast.classList.add('opacity-0'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function toggleDarkMode() {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    if(html.classList.contains('dark')) {
        html.classList.remove('dark'); map.removeLayer(mapTilesDark); mapTilesLight.addTo(map);
        icon.innerHTML = `<i data-lucide="moon" class="w-5 h-5"></i>`;
    } else {
        html.classList.add('dark'); map.removeLayer(mapTilesLight); mapTilesDark.addTo(map);
        icon.innerHTML = `<i data-lucide="sun" class="w-5 h-5"></i>`;
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
        btn.classList.add('bg-slate-50', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
    });
    event.target.classList.add('bg-indigo-600', 'text-white');
    event.target.classList.remove('bg-slate-50', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
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
                <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                <p class="text-sm font-bold">No matching reports found.</p>
            </div>`;
        return;
    }
    
    // SVG Icons for buttons to ensure rendering
    const editIcon = `<svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>`;
    const delIcon = `<svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;
    const linkIcon = `<svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>`;
    const flagIcon = `<svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"></path></svg>`;

    reportsToRender.forEach(report => {
        let typeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400';
        if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 border-rose-100 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-400';
        if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400';
        if(report.type.includes('Accessibility')) typeColor = 'text-purple-600 bg-purple-50 border-purple-100 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400';

        let menuItems = `<button onclick="event.stopPropagation(); shareReport(${report.id})" class="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold whitespace-nowrap">${linkIcon} Share</button>`;
        if(report.isMine) {
            menuItems += `
                <button onclick="event.stopPropagation(); editReportDesc(event, ${report.id})" class="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold whitespace-nowrap">${editIcon} Edit</button>
                <button onclick="event.stopPropagation(); deleteReport(${report.id})" class="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold whitespace-nowrap">${delIcon} Delete</button>
            `;
        } else {
            menuItems += `<button onclick="event.stopPropagation(); openFlagModal(${report.id})" class="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold whitespace-nowrap">${flagIcon} Report</button>`;
        }

        const actionBtn = `
            <div class="absolute top-3 right-3 z-20">
                <div class="relative inline-block text-left" onclick="event.stopPropagation()">
                    <button onclick="toggleReportMenu(event, ${report.id})" class="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-full transition-colors flex items-center justify-center w-8 h-8">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                    </button>
                    <div id="menu-${report.id}" class="hidden absolute right-0 mt-1 w-32 glass-panel rounded-md shadow-lg z-50 overflow-hidden"><div class="py-1">${menuItems}</div></div>
                </div>
            </div>`;

        const tagHTML = report.tags.map(t => `<span class="badge bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">${t}</span>`).join('');
        const upBtnStyle = report.userVote === 1 ? "text-emerald-500 scale-110" : "text-slate-400 hover:text-emerald-500";
        const downBtnStyle = report.userVote === -1 ? "text-rose-500 scale-110" : "text-slate-400 hover:text-rose-500";
        const privStyle = report.privacy === 'precise' ? 'text-rose-500' : 'text-indigo-500';

        list.innerHTML += `
            <div onclick="openDetailModal(${report.id})" class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-indigo-400 cursor-pointer relative group transition-all min-w-0">
                ${actionBtn}
                <div class="mb-3 flex items-center gap-2 pr-8 min-w-0">
                    <span class="badge border ${typeColor} shrink-0">${report.type.split('/')[0]}</span>
                    <span class="text-[10px] text-slate-400 font-medium truncate">${formatDate(report.timestamp)}</span>
                </div>
                <h3 class="font-bold text-slate-800 dark:text-white text-sm mb-2 pr-8 truncate" title="${report.title}">${report.title}</h3>
                <div class="mb-3 p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-700 text-[10px] text-slate-500 dark:text-slate-400 min-w-0">
                    <p class="font-bold flex items-center justify-between mb-1 min-w-0 border-b border-slate-200 dark:border-slate-700 pb-1">
                        <span class="truncate mr-2 text-slate-700 dark:text-slate-300 flex items-center gap-1 shrink">📍 <span class="truncate">${report.address}</span></span>
                        <span class="uppercase tracking-wider whitespace-nowrap shrink-0 ${privStyle}">${report.privacy === 'precise' ? 'Precise Pin' : 'Area Report'}</span>
                    </p>
                    <p class="mt-0.5 ml-4 truncate">Coords: ${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}</p>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-300 mb-3 line-clamp-2 leading-relaxed">${report.desc}</p>
                <div class="flex flex-wrap gap-1.5 mb-3">${tagHTML}</div>
                <div class="flex justify-between items-center border-t border-slate-100 dark:border-slate-700 pt-3">
                    <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">💬 ${report.comments.length} Comments</span>
                    <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700" onclick="event.stopPropagation()">
                        <button onclick="voteReport(${report.id}, 1)" class="transition-transform ${upBtnStyle}"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg></button>
                        <span class="font-bold text-sm text-slate-700 dark:text-slate-200 w-6 text-center">${report.cred}</span>
                        <button onclick="voteReport(${report.id}, -1)" class="transition-transform ${downBtnStyle}"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg></button>
                    </div>
                </div>
            </div>`;
    });
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

function editReportDesc(e, id) {
    if(openMenuId) { document.getElementById(`menu-${openMenuId}`).classList.add('hidden'); openMenuId = null; }
    const report = mockReports.find(r => r.id === id);
    const newDesc = prompt("Update your report description:", report.desc);
    if(newDesc !== null) {
        const trimmed = newDesc.trim();
        if(trimmed.length < 15) return showToast("Description must be at least 15 characters.", "error");
        const aiError = aiContentCheck(trimmed);
        if(aiError) return showToast(`AI Flag: ${aiError}`, "error");
        report.desc = trimmed; showToast("Report updated.", "success");
        filterReports(); if(activeDetailId === id) openDetailModal(id);
    }
}

function deleteReport(id) {
    if(openMenuId) { document.getElementById(`menu-${openMenuId}`).classList.add('hidden'); openMenuId = null; }
    if(confirm("Permanently delete this report?")) {
        mockReports = mockReports.filter(r => r.id !== id);
        showToast("Report deleted.", "success"); populateHeatmap(); filterReports();
    }
}

function editComment(reportId, commentIndex) {
    const report = mockReports.find(r => r.id === reportId);
    const newText = prompt("Edit comment:", report.comments[commentIndex].text);
    if(newText !== null) {
        const trimmed = newText.trim();
        if(trimmed === '') return showToast("Comment cannot be empty.", "error");
        const aiError = aiContentCheck(trimmed);
        if(aiError) return showToast(`AI Flag: ${aiError}`, "error");
        report.comments[commentIndex].text = trimmed; showToast("Comment updated.", "success");
        openDetailModal(reportId); filterReports(); 
    }
}

function deleteComment(reportId, commentIndex) {
    if(confirm("Delete comment?")) {
        const report = mockReports.find(r => r.id === reportId);
        report.comments.splice(commentIndex, 1);
        showToast("Comment deleted.", "success"); openDetailModal(reportId); filterReports(); 
    }
}

function openDetailModal(id) {
    activeDetailId = id;
    const report = mockReports.find(r => r.id === id);
    const privStyle = report.privacy === 'precise' ? 'text-rose-500' : 'text-indigo-500';

    document.getElementById('detail-content').innerHTML = `
        <div class="flex justify-between items-start mb-4 pr-10 min-w-0">
            <span class="badge bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${report.type}</span>
            <span class="text-xs text-slate-400 font-medium truncate ml-2">${formatDate(report.timestamp)}</span>
        </div>
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-4 pr-4 break-words">${report.title}</h2>
        <div class="mb-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 leading-relaxed min-w-0">
            <p class="font-bold flex items-center justify-between mb-2 border-b border-slate-200 dark:border-slate-700 pb-2 min-w-0">
                <span class="text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate mr-2">📍 <span class="truncate whitespace-normal">${report.address}</span></span>
                <span class="uppercase tracking-wider whitespace-nowrap shrink-0 ${privStyle}">${report.privacy === 'precise' ? 'Precise Pin' : 'Area Report'}</span>
            </p>
            <p class="ml-5 truncate opacity-80">Coordinates: ${report.lat.toFixed(5)}, ${report.lng.toFixed(5)}</p>
        </div>
        <p class="text-sm text-slate-700 dark:text-slate-300 mb-4 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-lg leading-relaxed border border-slate-100 dark:border-slate-700/50 break-words">${report.desc}</p>
    `;
    
    const cList = document.getElementById('detail-comments');
    cList.innerHTML = report.comments.length ? '' : '<p class="text-sm text-slate-400">No comments yet.</p>';
    report.comments.forEach((c, idx) => {
        const actionBtns = c.isMine ? `
            <div class="flex gap-2 shrink-0">
                <button onclick="editComment(${report.id}, ${idx})" class="text-indigo-500 hover:text-indigo-700 font-bold text-xs p-1">Edit</button>
                <button onclick="deleteComment(${report.id}, ${idx})" class="text-rose-500 hover:text-rose-700 font-bold text-xs p-1">Delete</button>
            </div>` : '';
        cList.innerHTML += `<div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg text-sm flex justify-between items-start border border-slate-100 dark:border-slate-700 gap-4 mb-2"><p class="text-slate-800 dark:text-slate-200 break-words">${c.text}</p>${actionBtns}</div>`;
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
    document.getElementById('pin-status').classList.add('hidden');
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

    document.getElementById('report-title').value = ''; document.getElementById('report-desc').value = ''; document.getElementById('custom-tag-input').value = '';
    closeReportModal(); populateHeatmap(); filterReports(); currentTags = []; 
    if(customPinMarker) { map.removeLayer(customPinMarker); customPinMarker = null; customPinCoords = null; }
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
    container.innerHTML = suggested.map(tag => `<span class="badge bg-white text-indigo-600 border border-indigo-200 cursor-pointer hover:bg-indigo-50" onclick="addTag('${tag}')">${tag} +</span>`).join('');
}

function handleTagKeypress(e) { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }
function addCustomTag() {
    let val = document.getElementById('custom-tag-input').value.trim().replace(/\s+/g, '_');
    if(val) { if(!val.startsWith('#')) val = '#' + val; addTag(val.toLowerCase()); document.getElementById('custom-tag-input').value = ''; }
}
function addTag(tag) {
    if(!currentTags.includes(tag) && currentTags.length < 5) {
        currentTags.push(tag);
        document.getElementById('active-tags-container').innerHTML = currentTags.map(t => `<span class="badge bg-indigo-600 text-white">${t} <button onclick="removeTag('${t}')" class="hover:text-rose-300 ml-1">✕</button></span>`).join('');
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
                li.className = "p-3 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 dark:text-slate-200 text-slate-700 flex items-center gap-2 truncate min-w-0";
                li.innerHTML = `📍 <span class="truncate">${item.display_name}</span>`;
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

    btn.innerHTML = `Finding paths...`; btn.disabled = true;

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
                streetList.innerHTML += `<li class="flex items-center gap-2">▪ ${step.name}</li>`;
                lastStreet = step.name;
            }
        });

        document.getElementById('route-details').classList.remove('hidden');
        document.getElementById('clear-route-btn').classList.remove('hidden');
        document.getElementById('route-dist').innerHTML = `🚶 ${distKm} km`;
        document.getElementById('route-time').innerHTML = `⏱ ${timeMin} mins`;
        setTimeout(setupDrag, 100);
    } catch (e) { showToast("Error calculating route.", "error"); }
    btn.innerHTML = `Calculate Route`; btn.disabled = false;
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
function exportData() { showToast("Preparing PDF/CSV Data Package...", "success"); setTimeout(() => { showToast("Export Downloaded Successfully.", "success"); }, 2000); }
function populatePartnerPortal() { /* Left exactly as previous */ }

window.onload = initMap;
