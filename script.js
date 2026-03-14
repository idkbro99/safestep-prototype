const manilaCenter = [14.6060, 120.9870]; 
let map, heatmapLayer, routingLine;
let mapTilesLight, mapTilesDark;

// FIX: Made active filters an array for multi-select functionality
let activeFilters = ['all'];
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

// FIX: Markers for Route Start and End
let routeStartMarker = null;
let routeEndMarker = null;

let searchTimeout;
let startCoords = null, endCoords = null;
let isDragging = false;
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

// FIX: Expanded Hotspots for better heatmap/report distribution across cities
const hotspots = [
    { name: 'FEU Tech & Main', lat: 14.6040, lng: 120.9875, risk: 90, spread: 0.005, reports: 45 },
    { name: 'UST España Blvd', lat: 14.6096, lng: 120.9894, risk: 85, spread: 0.007, reports: 40 },
    { name: 'SM San Lazaro', lat: 14.6155, lng: 120.9841, risk: 78, spread: 0.006, reports: 35 },
    { name: 'LRT Tayuman', lat: 14.6168, lng: 120.9825, risk: 82, spread: 0.004, reports: 25 },
    { name: 'Cubao Center', lat: 14.6186, lng: 121.0526, risk: 68, spread: 0.015, reports: 20 },
    { name: 'Monumento Circle', lat: 14.6565, lng: 120.9830, risk: 75, spread: 0.012, reports: 25 },
    { name: 'Makati Poblacion', lat: 14.5630, lng: 121.0310, risk: 45, spread: 0.008, reports: 15 },
    { name: 'BGC High Street', lat: 14.5510, lng: 121.0520, risk: 20, spread: 0.010, reports: 10 },
    { name: 'Taft Rotonda Pasay', lat: 14.5380, lng: 120.9980, risk: 80, spread: 0.009, reports: 30 },
    { name: 'Commonwealth QC', lat: 14.6850, lng: 121.0820, risk: 65, spread: 0.015, reports: 20 }
];

let mockReports = [];

hotspots.forEach(spot => {
    for(let i=0; i<spot.reports; i++) {
        const types = ['Harassment/Aggression', 'Crowd/Atmosphere', 'Hazards', 'Accessibility/Obstructions'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        let issueDesc = `Community report regarding safety at this location. Needs local attention.`;
        if(type === 'Accessibility/Obstructions') issueDesc = "Damaged sidewalks and blocked PWD ramps reported here. Very difficult for wheelchairs.";
        if(type === 'Hazards') issueDesc = "Poor lighting and potential flooding hazards reported. Avoid walking alone at night.";
        
        mockReports.push({
            id: idCounter++, type: type, title: `${type.split('/')[0]} near ${spot.name.split(' ')[0]}`, desc: issueDesc,
            cred: Math.floor(Math.random() * 300) + 10, relevance: spot.risk + Math.random() * 30,
            lat: spot.lat + (Math.random() - 0.5) * spot.spread, lng: spot.lng + (Math.random() - 0.5) * spot.spread,
            address: `${spot.name} Area`, 
            tags: ['#' + spot.name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '')],
            userVote: 0, timestamp: Date.now() - (Math.random() * 10000000000), 
            comments: Math.random() > 0.6 ? [{text: "Noted, thank you for sharing.", isMine: false}] : [],
            isMine: false
        });
    }
});

// Close menus globally
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
    if(userMenu && !userMenu.contains(e.target) && e.target.closest('button')?.id !== 'user-avatar-btn') {
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
        btn.innerHTML = `<i data-lucide="crosshair" class="w-3.5 h-3.5 inline"></i> Focus 1km Area`;
        btn.classList.replace('bg-rose-600', 'bg-indigo-600');
        infoBox.classList.add('hidden');
        populateHeatmap();
        filterReports(); 
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
            
            btn.innerHTML = `<i data-lucide="x" class="w-3.5 h-3.5 inline"></i> Clear 1km Focus`; 
            btn.classList.replace('bg-indigo-600', 'bg-rose-600');

            infoBox.innerHTML = `<i>Fetching location...</i>`;
            infoBox.classList.remove('hidden');
            const address = await getAddressFromCoords(radiusCenterCoords[0], radiusCenterCoords[1]);
            infoBox.innerHTML = `<b>1km Radius Focus</b><br><span class="opacity-80 leading-snug block mt-1 text-slate-500 line-clamp-2">${address}</span>`;

            populateHeatmap();
            filterReports(); 
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

// FIX: Enhanced Jibberish Detection logic added to block any random keyboard smashes/unnatural strings
function aiContentCheck(text) {
    if(!text) return "Input cannot be empty.";
    
    const badWords = ['gago', 'puta', 'bobo', 'shit', 'fuck', 'spam', 'asshole', 'damn'];
    const lower = text.toLowerCase();
    if(badWords.some(bw => lower.includes(bw))) return "Inappropriate language detected. Request denied.";
    
    // Check for obvious 5+ character spam repeating blocks
    if(/(.)\1{4,}/.test(text)) return "Repetitive spam detected.";
    
    // Check for gibberish (e.g. "asdfghjkl", "qwrty") based on vowels vs consonants lengths and sequence length
    const noVowels = /^[bcdfghjklmnpqrstvwxyz]+$/i;
    const words = text.split(/\s+/);
    for (let w of words) {
        if (w.length > 15 && !noVowels.test(w)) return "Unnatural word length (Jibberish detected).";
        if (w.length > 7 && noVowels.test(w)) return "Unnatural consonant sequence (Jibberish detected).";
    }
    
    // Check missing spaces entirely in long sentences
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
        expanded.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => {
            expanded.classList.add('hidden');
            collapsed.classList.remove('hidden');
            collapsed.classList.add('flex');
            setTimeout(() => collapsed.classList.replace('opacity-0', 'opacity-100'), 50);
            map.invalidateSize(true);
            setupDrag();
        }, 300);
    } else {
        sidebar.classList.remove('w-16');
        sidebar.classList.add('md:w-[460px]', 'sm:w-[380px]', 'w-11/12');
        collapsed.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => {
            collapsed.classList.add('hidden');
            collapsed.classList.remove('flex');
            expanded.classList.remove('hidden');
            setTimeout(() => expanded.classList.replace('opacity-0', 'opacity-100'), 50);
            map.invalidateSize(true);
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
    
    const inputStyle = "w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white transition-all";
    
    if(type === 'general') {
        title.innerText = "General User Login";
        container.innerHTML = `
            <input type="text" id="login-email" placeholder="Username or Email" class="${inputStyle}" value="user@mail.com">
            <input type="password" placeholder="Password" class="${inputStyle}" value="password">
        `;
    } else {
        title.innerText = "Partner Agency Login";
        container.innerHTML = `
            <input type="text" id="login-email" placeholder="Official Email" class="${inputStyle}" value="agency@ncr.gov.ph">
            <input type="text" placeholder="Employee ID" class="${inputStyle}" value="EMP-4029">
            <input type="password" placeholder="Password" class="${inputStyle}" value="password">
        `;
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
        
        const colorClass = currentUser.type === 'partner' ? 'bg-slate-600 hover:bg-slate-700 border-slate-500' : 'bg-indigo-600 hover:bg-indigo-700 border-indigo-500';
        const iconName = currentUser.type === 'partner' ? 'building' : 'user';
        avatarBtn.className = `w-10 h-10 flex items-center justify-center text-white rounded-full shadow-md transition border border-white dark:border-slate-700 ${colorClass}`;
        avatarBtn.innerHTML = `<i data-lucide="${iconName}" class="w-5 h-5"></i>`;
        
        const typeLabelColor = currentUser.type === 'partner' ? 'text-slate-500 dark:text-slate-400' : 'text-indigo-600 dark:text-indigo-400';
        const typeLabelText = currentUser.type === 'partner' ? 'Partner Agency' : 'General Account';
        
        let extraLinks = '';
        if (currentUser.type === 'partner') {
            extraLinks = `<button onclick="togglePortal()" class="w-full flex items-center gap-3 px-4 py-3 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold border-b border-slate-100 dark:border-slate-700/50 whitespace-nowrap transition-colors"><i data-lucide="layout-dashboard" class="w-4 h-4"></i> Partner Dashboard</button>`;
        }
        
        dropdown.innerHTML = `
            <div class="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 min-w-0">
                <p class="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold mb-0.5">Signed in as</p>
                <p class="text-sm font-bold text-slate-800 dark:text-white truncate" title="${currentUser.email}">${currentUser.email}</p>
                <p class="text-[10px] uppercase tracking-wider font-bold ${typeLabelColor} mt-1 truncate">${typeLabelText}</p>
            </div>
            ${extraLinks}
            <button onclick="showToast('Account settings opening...', 'success')" class="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold border-b border-slate-100 dark:border-slate-700/50 whitespace-nowrap transition-colors"><i data-lucide="settings" class="w-4 h-4"></i> Account Settings</button>
            <button onclick="logoutUser()" class="w-full flex items-center gap-3 px-4 py-3 text-sm text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold rounded-b-xl whitespace-nowrap transition-colors"><i data-lucide="log-out" class="w-4 h-4"></i> Logout</button>
        `;
        lucide.createIcons();
    }
}

// Feedback Star Logic
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

// FIX: Strictly validated text length to prevent incorrect notification triggers
function submitFeedback() {
    const text = document.getElementById('feedback-text').value.trim();
    if(feedbackRating === 0) return showToast("Please select a star rating.", "error");
    if(text.length === 0) return showToast("Feedback cannot be empty.", "error");
    
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
        pinStatus.innerHTML = `<b>Pinned Location:</b><br><span class="text-[10px] text-slate-500 font-normal leading-snug block mt-1">${address}</span><span class="text-[10px] text-slate-400 font-normal mt-1 block">Lat: ${customPinCoords[0].toFixed(5)}, Lng: ${customPinCoords[1].toFixed(5)}</span>`;
    });
}

// FIX: Handled the pin disappearing gracefully after 5s by smoothly shrinking it visually 
function focusOnLocation(lat, lng) {
    map.setView([lat, lng], 18);
    if(customPinMarker) map.removeLayer(customPinMarker);
    customPinMarker = L.marker([lat, lng]).addTo(map);
    
    setTimeout(() => { 
        if(customPinMarker && !isPickingLocation) { 
            const el = customPinMarker.getElement();
            if(el) {
                el.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
                el.style.transform += ' scale(0)';
                el.style.opacity = '0';
                setTimeout(() => {
                    if(customPinMarker) {
                        map.removeLayer(customPinMarker);
                        customPinMarker = null;
                    }
                }, 500);
            } else {
                map.removeLayer(customPinMarker); 
                customPinMarker = null; 
            }
        }
    }, 5000);
}

function setupDrag() {
    const dragItem = document.getElementById("route-panel");
    const dragHeader = document.getElementById("route-panel-header");
    const mapContainer = document.getElementById('map-container');
    
    if(!mapContainer || !dragItem || !dragHeader) return;

    let dragOffsetX = 0, dragOffsetY = 0;
    dragItem.style.transition = 'none';

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
            
            const minLeft = mapRect.left + 24; 
            const maxLeft = mapRect.right - dragItem.offsetWidth - 24;
            const minTop = mapRect.top + 24; 
            const maxTop = mapRect.bottom - dragItem.offsetHeight - 24;

            newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
            newTop = Math.max(minTop, Math.min(newTop, maxTop));
            
            dragItem.style.position = 'fixed';
            dragItem.style.left = newLeft + 'px';
            dragItem.style.top = newTop + 'px';
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

// FIX: Adjusted padding and width to fit context naturally, and fixed the exclamation point SVG
function showToast(msg, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colorClass = type === 'error' ? 'bg-rose-500' : 'bg-emerald-500';
    
    const icon = type === 'error' 
        ? `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>` 
        : `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    
    toast.className = `${colorClass} text-white px-5 py-3 rounded-xl shadow-2xl font-bold text-sm transform transition-all duration-300 translate-y-[-20px] opacity-0 flex items-center justify-center gap-3 pointer-events-auto w-auto inline-flex max-w-[90vw] md:max-w-md`;
    toast.innerHTML = `${icon} <span class="break-words leading-snug">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.remove('translate-y-[-20px]', 'opacity-0'); }, 10);
    setTimeout(() => { toast.classList.add('opacity-0'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function toggleDarkMode() {
    const html = document.documentElement;
    const icons = document.querySelectorAll('#theme-icon');
    if(html.classList.contains('dark')) {
        html.classList.remove('dark'); map.removeLayer(mapTilesDark); mapTilesLight.addTo(map);
        icons.forEach(i => i.innerHTML = `<i data-lucide="moon" class="w-5 h-5"></i>`);
    } else {
        html.classList.add('dark'); map.removeLayer(mapTilesLight); mapTilesDark.addTo(map);
        icons.forEach(i => i.innerHTML = `<i data-lucide="sun" class="w-5 h-5"></i>`);
    }
    lucide.createIcons();
    setTimeout(updateOpacity, 100);
}

function toggleHeatmap() {
    if(document.getElementById('heatmap-toggle').checked) { map.addLayer(heatmapLayer); updateOpacity(); }
    else map.removeLayer(heatmapLayer);
}

// FIX: Adjusted logic for Multi-select on Category Filters
function setCategoryFilter(cat) {
    if (cat === 'all') {
        activeFilters = ['all'];
    } else {
        activeFilters = activeFilters.filter(f => f !== 'all');
        if (activeFilters.includes(cat)) {
            activeFilters = activeFilters.filter(f => f !== cat);
        } else {
            activeFilters.push(cat);
        }
        if (activeFilters.length === 0) activeFilters = ['all'];
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
        const btnCat = btn.getAttribute('data-cat');
        if (activeFilters.includes(btnCat)) {
            btn.classList.add('bg-indigo-600', 'text-white');
            btn.classList.remove('bg-slate-50', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white');
            btn.classList.add('bg-slate-50', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
        }
    });
    
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
        // FIX: Array inclusions check for multi-select
        const matchCat = activeFilters.includes('all') || activeFilters.includes(report.type);
        
        let matchSearch = false;
        if(search.startsWith('#')) {
            matchSearch = report.tags.some(t => t.toLowerCase() === search || t.toLowerCase().startsWith(search));
        } else {
            matchSearch = report.title.toLowerCase().includes(search) || report.desc.toLowerCase().includes(search) || report.tags.some(t => t.toLowerCase().includes(search));
        }
        const matchRadius = (!isRadiusActive || !radiusCenterCoords) ? true : (getDistance(radiusCenterCoords[0], radiusCenterCoords[1], report.lat, report.lng) <= 1.0); 
        return matchCat && matchSearch && matchRadius;
    });

    if(activeSort === 'relevant') filtered.sort((a,b) => b.relevance - a.relevance);
    else if(activeSort === 'popular') filtered.sort((a,b) => b.cred - a.cred);
    else if(activeSort === 'newest') filtered.sort((a,b) => b.timestamp - a.timestamp);
    else if(activeSort === 'oldest') filtered.sort((a,b) => a.timestamp - b.timestamp);

    renderReports(filtered);

    // FIX: Scrolled explicitly back to the top of the list
    const list = document.getElementById('reports-list');
    if (list) list.scrollTop = 0;
}

function renderReports(reportsToRender = null) {
    if(!reportsToRender) { filterReports(); return; } 
    const list = document.getElementById('reports-list');
    list.innerHTML = '';

    if(reportsToRender.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-center opacity-80 text-slate-500">
