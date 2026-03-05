const manilaCenter = [14.6060, 120.9870]; 
let activeFilter = 'all';
let activeSort = 'relevant';
let activeDetailId = null;
let currentTags = [];
let searchTimeout;
let startCoords = null;
let endCoords = null;

// Dense Data Hotspots (Manila Area)
const manilaHotspots = [
    { name: 'FEU Tech Area', lat: 14.6042, lng: 120.9880, risk: 95, typePref: 'Environmental/Path Hazards', issue: 'Dimly lit alley near the campus exit. High risk at night.' },
    { name: 'FEU Main / Morayta', lat: 14.6035, lng: 120.9873, risk: 88, typePref: 'Harassment/Aggression', issue: 'Groups of loiterers catcalling students walking towards España.' },
    { name: 'UST España Blvd', lat: 14.6096, lng: 120.9894, risk: 92, typePref: 'Accessibility/Obstructions', issue: 'Deep flood water hides potholes. Sidewalks blocked by vendors.' },
    { name: 'UST Dapitan', lat: 14.6110, lng: 120.9890, risk: 85, typePref: 'Crowd/Atmosphere', issue: 'Extremely dense student crowd, high pickpocket risk during rush hour.' },
    { name: 'SM San Lazaro Vicinity', lat: 14.6155, lng: 120.9841, risk: 82, typePref: 'Crowd/Atmosphere', issue: 'Jeepney terminal congestion spilling onto the road. Snatching reported.' }
];

// Other NCR Cities (Less dense for contrast)
const generalNCR = [
    { name: 'Quezon City', lat: 14.6488, lng: 121.0509, risk: 50 },
    { name: 'Makati (CBD)', lat: 14.5547, lng: 121.0244, risk: 20 },
    { name: 'Taguig (BGC)', lat: 14.5300, lng: 121.0450, risk: 15 },
    { name: 'Pasay', lat: 14.5378, lng: 121.0014, risk: 60 }
];

let mockReports = [];
let idCounter = 1;

// Generate Massive Cluster Data for Manila
manilaHotspots.forEach(spot => {
    let reportCount = spot.risk * 1.5; // Hundreds of data points
    for(let i=0; i<reportCount; i++) {
        const isPrimaryIssue = Math.random() > 0.3;
        const type = isPrimaryIssue ? spot.typePref : ['Harassment/Aggression', 'Crowd/Atmosphere', 'Environmental/Path Hazards', 'Accessibility/Obstructions'][Math.floor(Math.random() * 4)];
        
        mockReports.push({
            id: idCounter++,
            type: type,
            title: `Incident near ${spot.name}`,
            desc: isPrimaryIssue ? spot.issue : `General community safety concern logged in this sector.`,
            cred: Math.floor(Math.random() * 300) + 10,
            relevance: spot.risk + Math.random() * 20,
            lat: spot.lat + (Math.random() - 0.5) * 0.007, // Tight radius
            lng: spot.lng + (Math.random() - 0.5) * 0.007,
            tags: ['#' + spot.name.split(' ')[0].toLowerCase(), '#ncr_alert'],
            userVote: 0,
            timestamp: Date.now() - (Math.random() * 10000000000),
            comments: Math.random() > 0.6 ? [{text: "I experienced this too.", isMine: false}] : [],
            isMine: false
        });
    }
});

// Generate Sparse Data for rest of NCR
generalNCR.forEach(city => {
    let reportCount = city.risk / 2;
    for(let i=0; i<reportCount; i++) {
        mockReports.push({
            id: idCounter++, type: 'Environmental/Path Hazards', title: `Report in ${city.name}`, desc: `Minor community report.`,
            cred: Math.floor(Math.random() * 50), relevance: city.risk, lat: city.lat + (Math.random() - 0.5) * 0.02, lng: city.lng + (Math.random() - 0.5) * 0.02,
            tags: [], userVote: 0, timestamp: Date.now() - (Math.random() * 10000000000), comments: [], isMine: false
        });
    }
});

let map, heatmapLayer, routingLine;
let mapTilesLight, mapTilesDark;

function initMap() {
    map = L.map('map', { zoomControl: false }).setView(manilaCenter, 15);
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapTilesLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    mapTilesDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    
    if(document.documentElement.classList.contains('dark')) mapTilesDark.addTo(map);
    else mapTilesLight.addTo(map);

    populateHeatmap();
    renderReports();
    populatePartnerPortal();
    setupConstrainedDrag();
}

function populateHeatmap() {
    if(heatmapLayer) map.removeLayer(heatmapLayer);
    
    // Intense mapping for Manila
    let heatData = mockReports.map(r => [r.lat, r.lng, r.cred / 80]); 
    mockReports.forEach(r => {
        if(r.lat > 14.59 && r.lat < 14.62) { // Add padding noise only to Manila area
            for(let i=0; i<4; i++) {
                heatData.push([r.lat + (Math.random()-0.5)*0.002, r.lng + (Math.random()-0.5)*0.002, Math.random() * 0.6]);
            }
        }
    });

    heatmapLayer = L.heatLayer(heatData, {
        radius: 20, blur: 15, maxZoom: 18,
        gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    }).addTo(map);
}

// Fixed Dragging Logic (Constrained to Map Container)
function setupConstrainedDrag() {
    const dragItem = document.getElementById("route-panel");
    const dragHeader = document.getElementById("route-panel-header");
    const container = document.getElementById("map-container");

    let isDragging = false, startX, startY, startLeft, startTop;

    const dragStart = (e) => {
        if (e.target !== dragHeader && !dragHeader.contains(e.target)) return;
        isDragging = true;
        
        // Remove tailwind positioning classes to take full manual control
        dragItem.classList.remove('md:left-[440px]', 'left-4', 'top-6');
        
        if(!dragItem.style.left) dragItem.style.left = dragItem.offsetLeft + 'px';
        if(!dragItem.style.top) dragItem.style.top = dragItem.offsetTop + 'px';

        startX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
        startY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
        startLeft = parseInt(dragItem.style.left, 10);
        startTop = parseInt(dragItem.style.top, 10);
        
        document.addEventListener(e.type === "touchstart" ? "touchmove" : "mousemove", dragMove, {passive: false});
        document.addEventListener(e.type === "touchstart" ? "touchend" : "mouseup", dragEnd);
    };

    const dragMove = (e) => {
        if (!isDragging) return;
        e.preventDefault(); // Stop scrolling on touch
        
        const currentX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const currentY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;

        let newLeft = startLeft + (currentX - startX);
        let newTop = startTop + (currentY - startY);

        // Constraint boundaries (don't go off map)
        newLeft = Math.max(0, Math.min(newLeft, container.clientWidth - dragItem.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, container.clientHeight - dragItem.offsetHeight));

        dragItem.style.left = newLeft + 'px';
        dragItem.style.top = newTop + 'px';
        dragItem.style.transform = 'none'; // Ensure no conflicting CSS transforms
    };

    const dragEnd = (e) => {
        isDragging = false;
        document.removeEventListener("mousemove", dragMove);
        document.removeEventListener("touchmove", dragMove);
        document.removeEventListener("mouseup", dragEnd);
        document.removeEventListener("touchend", dragEnd);
    };

    dragHeader.addEventListener("mousedown", dragStart);
    dragHeader.addEventListener("touchstart", dragStart, {passive: false});
}


// UI Toggles & Logic
function toggleDarkMode() {
    const html = document.documentElement;
    if(html.classList.contains('dark')) {
        html.classList.remove('dark');
        map.removeLayer(mapTilesDark); mapTilesLight.addTo(map);
    } else {
        html.classList.add('dark');
        map.removeLayer(mapTilesLight); mapTilesDark.addTo(map);
    }
}

function toggleSidebar() {
    document.getElementById('user-sidebar').classList.toggle('-translate-x-full');
    document.getElementById('expand-sidebar-btn').classList.toggle('hidden');
    // We removed automatic route-panel shifting because it's purely draggable now.
}

function toggleHeatmap() {
    if(document.getElementById('heatmap-toggle').checked) map.addLayer(heatmapLayer);
    else map.removeLayer(heatmapLayer);
}

// Reports & Filtering
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
        return matchCat && matchSearch;
    });

    if(activeSort === 'relevant') filtered.sort((a,b) => b.relevance - a.relevance);
    else if(activeSort === 'popular') filtered.sort((a,b) => b.cred - a.cred);
    else if(activeSort === 'newest') filtered.sort((a,b) => b.timestamp - a.timestamp);
    else if(activeSort === 'oldest') filtered.sort((a,b) => a.timestamp - b.timestamp);
    
    renderReports(filtered);
}

// Fix: Voting Propagation
function voteReport(e, id, change) {
    e.stopPropagation(); // Stops the modal from opening when clicking the vote button
    e.preventDefault();
    const report = mockReports.find(r => r.id === id);
    if (!report) return;
    report.cred += change; 
    renderReports();
    if(activeDetailId === id) openDetailModal(id);
}

function renderReports(reportsToRender = null) {
    if(!reportsToRender) { filterReports(); return; } 
    const list = document.getElementById('reports-list');
    list.innerHTML = '';
    
    // Only render top 50 in UI to prevent DOM lag, prototype trick
    const toRender = reportsToRender.slice(0, 50);

    toRender.forEach(report => {
        let typeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';
        if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 border-rose-100';
        if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 border-amber-100';
        if(report.type.includes('Accessibility')) typeColor = 'text-purple-600 bg-purple-50 border-purple-100';

        const actionBtn = report.isMine 
            ? `<button onclick="deleteReport(event, ${report.id})" class="text-rose-400 hover:text-rose-600 font-bold text-xs">🗑 Delete</button>`
            : `<button onclick="openFlagModal(event, ${report.id})" class="text-slate-400 hover:text-rose-500 font-bold text-xs">🚩 Flag</button>`;

        const tagHTML = report.tags.map(t => `<span class="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">${t}</span>`).join('');

        list.innerHTML += `
            <div onclick="openDetailModal(${report.id})" class="bg-white dark:bg-slate-800 p-4 rounded-md shadow-sm border border-slate-200 dark:border-slate-700 hover:border-indigo-300 cursor-pointer relative transition">
                <div class="absolute top-4 right-4">${actionBtn}</div>
                <span class="text-[10px] font-bold ${typeColor} uppercase tracking-wider px-2 py-0.5 rounded border mb-2 inline-block">${report.type.split('/')[0]}</span>
                <h3 class="font-bold text-slate-800 dark:text-white text-sm mb-1 pr-10">${report.title}</h3>
                <p class="text-xs text-slate-600 dark:text-slate-300 mb-2 line-clamp-2">${report.desc}</p>
                <div class="flex flex-wrap gap-1.5 mb-3">${tagHTML}</div>
                <div class="flex justify-between items-center border-t border-slate-100 dark:border-slate-700 pt-3">
                    <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400">💬 ${report.comments.length} Comments</span>
                    <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
                        <button onclick="voteReport(event, ${report.id}, 1)" class="font-bold text-base text-slate-400 hover:text-emerald-500">⇧</button>
                        <span class="font-bold text-sm">${report.cred}</span>
                        <button onclick="voteReport(event, ${report.id}, -1)" class="font-bold text-base text-slate-400 hover:text-rose-500">⇩</button>
                    </div>
                </div>
            </div>
        `;
    });
}

// AI Tag Suggester & Logic
function suggestTags() {
    const title = document.getElementById('report-title').value.toLowerCase();
    const cat = document.getElementById('report-category').value;
    const aiTags = document.getElementById('ai-tags');
    const container = document.getElementById('tag-container');
    
    let suggested = [];
    if(cat === 'Harassment/Aggression') suggested.push('#unsafe', '#catcalling');
    if(cat === 'Crowd/Atmosphere') suggested.push('#crowded', '#pickpocket');
    if(cat === 'Environmental/Path Hazards') suggested.push('#hazard', '#dark_alley');
    if(cat === 'Accessibility/Obstructions') suggested.push('#blocked_ramp', '#no_elevator');
    
    if(title.includes('feu') || title.includes('tech')) suggested.push('#FEUTech');
    if(title.includes('ust') || title.includes('espana')) suggested.push('#UST');
    if(title.includes('sm') || title.includes('lazaro')) suggested.push('#SMSanLazaro');
    if(title.includes('flood')) suggested.push('#flooded');

    if(suggested.length === 0) { aiTags.classList.add('hidden'); return; }
    
    aiTags.classList.remove('hidden');
    container.innerHTML = suggested.map(tag => 
        `<span class="text-xs font-bold bg-white text-indigo-600 border border-indigo-200 px-2 py-1 rounded cursor-pointer hover:bg-indigo-50" onclick="addTag('${tag}')">${tag} +</span>`
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
        document.getElementById('active-tags-container').innerHTML = currentTags.map(t => `<span class="text-xs bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1">${t} <button onclick="removeTag('${t}')" class="hover:text-rose-300 font-bold ml-1">×</button></span>`).join('');
    }
}
function removeTag(tag) { currentTags = currentTags.filter(t => t !== tag); addTag('refresh'); }

// Routing (Nominatim + Adjusted OSRM Time)
function handleSearch(inputEl, resultsId, target) {
    clearTimeout(searchTimeout);
    const query = inputEl.value;
    const resultsUl = document.getElementById(resultsId);
    if(query.length < 3) { resultsUl.classList.add('hidden'); return; }

    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=4&countrycodes=ph`);
            const data = await res.json();
            resultsUl.innerHTML = '';
            if(data.length === 0) { resultsUl.classList.add('hidden'); return; }

            data.forEach(item => {
                const li = document.createElement('li');
                li.className = "p-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 dark:text-slate-200 text-slate-700";
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
    if(!startCoords || !endCoords) return alert("Please select Start and Destination from dropdown.");

    btn.innerText = "Finding safe paths..."; btn.disabled = true;

    try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(osrmUrl);
        const data = await res.json();

        if(data.code !== "Ok") throw new Error();

        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        const distKm = (data.routes[0].distance / 1000).toFixed(2);
        
        // FIX: Manila Foot Traffic Time Multiplier. 
        // OSRM assumes a brisk, uninterrupted walk. In Manila, overpasses, crowds, and narrow alleys slow you down.
        // We multiply the raw OSRM duration by 1.35 for a realistic timeframe.
        const realisticTimeMin = Math.round((data.routes[0].duration / 60) * 1.35);

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
        document.getElementById('route-time').innerHTML = `⏱ ${realisticTimeMin} mins`;
        
    } catch (e) { alert("Error calculating route."); }
    btn.innerText = "Calculate Route"; btn.disabled = false;
}

function clearRoute() {
    if(routingLine) map.removeLayer(routingLine);
    document.getElementById('route-details').classList.add('hidden');
    document.getElementById('clear-route-btn').classList.add('hidden');
    document.getElementById('route-start').value = '';
    document.getElementById('route-end').value = '';
    startCoords = null; endCoords = null;
    map.setView(manilaCenter, 15);
}

// Modals & Partner Portal
function openReportModal() { document.getElementById('report-modal').classList.remove('hidden'); }
function closeReportModal() { document.getElementById('report-modal').classList.add('hidden'); }
function submitReport() {
    const title = document.getElementById('report-title').value;
    const cat = document.getElementById('report-category').value;
    const desc = document.getElementById('report-desc').value;
    if(!title || !cat || desc.length < 15) return alert("Fill all fields");

    mockReports.unshift({
        id: idCounter++, type: cat, title: title, desc: desc, cred: 1, relevance: 100, timestamp: Date.now(),
        lat: manilaCenter[0] + (Math.random() - 0.5) * 0.01,
        lng: manilaCenter[1] + (Math.random() - 0.5) * 0.01,
        tags: [...currentTags], comments: [], userVote: 1, isMine: true
    });
    document.getElementById('report-modal').classList.add('hidden');
    populateHeatmap(); renderReports(); currentTags = [];
}

function openFlagModal(e, id) { e.stopPropagation(); document.getElementById('flag-modal').classList.remove('hidden'); }
function closeFlagModal() { document.getElementById('flag-modal').classList.add('hidden'); }
function submitFlag() { closeFlagModal(); alert("Reported to moderators."); }

function openDetailModal(id) {
    activeDetailId = id;
    const report = mockReports.find(r => r.id === id);
    document.getElementById('detail-content').innerHTML = `<span class="text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border">${report.type}</span><h2 class="text-2xl font-bold mt-3 mb-2 dark:text-white">${report.title}</h2><p class="text-sm dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-4 rounded">${report.desc}</p>`;
    const cList = document.getElementById('detail-comments');
    cList.innerHTML = report.comments.length ? '' : '<p class="text-sm text-slate-400">No comments yet.</p>';
    report.comments.forEach((c) => { cList.innerHTML += `<div class="bg-slate-50 dark:bg-slate-800 p-3 rounded text-sm"><p class="dark:text-white">${c.text}</p></div>`; });
    document.getElementById('report-detail-modal').classList.remove('hidden');
}
function closeDetailModal() { document.getElementById('report-detail-modal').classList.add('hidden'); }
function submitComment() {
    const val = document.getElementById('new-comment').value.trim();
    if(!val) return;
    mockReports.find(r => r.id === activeDetailId).comments.push({ text: val });
    document.getElementById('new-comment').value = '';
    openDetailModal(activeDetailId); renderReports();
}

function togglePortal() { document.getElementById('partner-portal').classList.toggle('hidden'); }
function loginPortal() {
    document.getElementById('portal-login').classList.add('hidden');
    document.getElementById('portal-dashboard').classList.remove('hidden');
    document.getElementById('logout-btn').classList.remove('hidden');
}
function logoutPortal() {
    document.getElementById('portal-dashboard').classList.add('hidden');
    document.getElementById('portal-login').classList.remove('hidden');
    document.getElementById('logout-btn').classList.add('hidden');
}

function populatePartnerPortal() {
    const container = document.getElementById('city-stats-container');
    container.innerHTML = '';
    manilaHotspots.forEach(spot => {
        const color = spot.risk > 90 ? 'bg-rose-600' : 'bg-amber-500';
        container.innerHTML += `
            <div class="mb-4">
                <div class="flex justify-between text-sm mb-1.5 font-bold">
                    <span class="dark:text-slate-300">${spot.name}</span>
                    <span class="text-white px-2 py-0.5 rounded text-[10px] uppercase ${color}">Critical Level</span>
                </div>
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                    <div class="${color} h-2.5 rounded-full" style="width: ${spot.risk}%"></div>
                </div>
            </div>`;
    });
}
function closeEmergencyModal() { document.getElementById('emergency-modal').classList.add('hidden'); }

window.onload = initMap;
