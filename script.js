// Initial Data near FEU Tech / Manila
const feuCoords = [14.6042, 120.9880]; // Leaflet uses [lat, lng]
let currentTags = []; // Stores tags for new reports

const mockReports = [
    { type: 'Environmental/Path Hazards', title: 'Broken Streetlight & Dim Alley', desc: 'The alley behind the building is pitch black at night. Makes it feel very unsafe.', cred: 145, lat: 14.6045, lng: 120.9882, tags: ['#no_lights', '#blindspot'] },
    { type: 'Harassment/Aggression', title: 'Group of men catcalling', desc: 'Near the corner of Morayta and Espana. A group frequently loiters here.', cred: 98, lat: 14.6050, lng: 120.9890, tags: ['#catcalling', '#unsafe_vibe'] },
    { type: 'Accessibility/Obstructions', title: 'Blocked PWD Ramp', desc: 'Sidewalk vendors have completely blocked the wheelchair ramp.', cred: 70, lat: 14.6035, lng: 120.9875, tags: ['#blocked_ramp'] },
    { type: 'Crowd/Atmosphere', title: 'Overcrowded / Pickpocket risk', desc: 'Overpass is extremely crowded during rush hour. High risk area.', cred: 112, lat: 14.6028, lng: 120.9885, tags: ['#overcrowded', '#pickpocket_risk'] },
    { type: 'Environmental/Path Hazards', title: 'Deep open manhole', desc: 'Cover is completely missing on P. Campa street. Very dangerous.', cred: 210, lat: 14.6048, lng: 120.9868, tags: ['#hazard'] },
];

let map, heatmapLayer, routingLine;

// Initialize Leaflet Map
function initMap() {
    // 1. Create the map instance
    map = L.map('map', {
        zoomControl: false // Move zoom control for cleaner UI
    }).setView(feuCoords, 16);
    
    L.control.zoom({ position: 'topright' }).addTo(map);

    // 2. Add OpenStreetMap Base Layer (Free)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors & CARTO',
        maxZoom: 19
    }).addTo(map);

    // 3. Generate Heatmap Data (Including random padding points for density)
    let heatData = mockReports.map(r => [r.lat, r.lng, r.cred / 50]); // intensity based on cred
    
    // Add extra random points around FEU to make heatmap look populated
    for(let i=0; i<80; i++) {
        heatData.push([
            feuCoords[0] + (Math.random() - 0.5) * 0.008,
            feuCoords[1] + (Math.random() - 0.5) * 0.008,
            Math.random() * 0.8
        ]);
    }

    // 4. Initialize Heatmap Plugin
    heatmapLayer = L.heatLayer(heatData, {
        radius: 25,
        blur: 20,
        maxZoom: 17,
        gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    }).addTo(map);

    renderReports();
}

function toggleHeatmap() {
    const isChecked = document.getElementById('heatmap-toggle').checked;
    if(isChecked) {
        map.addLayer(heatmapLayer);
    } else {
        map.removeLayer(heatmapLayer);
    }
}

// Render & Filter Logic
function filterReports() {
    const category = document.getElementById('filter-category').value;
    const search = document.getElementById('search-bar').value.toLowerCase();
    
    const filtered = mockReports.filter(report => {
        const matchCategory = category === 'all' || report.type === category;
        const matchSearch = report.title.toLowerCase().includes(search) || 
                            report.desc.toLowerCase().includes(search) || 
                            report.tags.some(t => t.toLowerCase().includes(search));
        return matchCategory && matchSearch;
    });
    
    renderReports(filtered);
}

function renderReports(reportsToRender = mockReports) {
    const list = document.getElementById('reports-list');
    list.innerHTML = '';
    
    if(reportsToRender.length === 0) {
        list.innerHTML = '<p class="text-sm text-slate-500 text-center py-4">No reports found.</p>';
        return;
    }

    // Sort by cred score descending
    reportsToRender.sort((a,b) => b.cred - a.cred).forEach(report => {
        let typeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';
        if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 border-rose-100';
        if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 border-amber-100';

        const tagHTML = report.tags.map(t => `<span class="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">${t}</span>`).join('');

        list.innerHTML += `
            <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-bold ${typeColor} uppercase tracking-wider px-2 py-1 rounded-md border">${report.type.split('/')[0]}</span>
                </div>
                <h3 class="font-bold text-slate-800 text-sm mb-1">${report.title}</h3>
                <p class="text-xs text-slate-600 mb-3 leading-relaxed">${report.desc}</p>
                <div class="flex flex-wrap gap-1 mb-3">${tagHTML}</div>
                
                <div class="flex justify-between items-center border-t border-slate-50 pt-3">
                    <span class="text-[11px] font-semibold text-slate-400">🛡️ Cred Score</span>
                    <div class="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                        <button class="text-green-500 hover:text-green-600 transition font-bold">⇧</button>
                        <span class="font-bold text-sm text-slate-700 w-6 text-center">${report.cred}</span>
                        <button class="text-rose-500 hover:text-rose-600 transition font-bold">⇩</button>
                    </div>
                </div>
            </div>
        `;
    });
}

// Safest Route Mock Simulator
function calculateRoute() {
    const start = document.getElementById('route-start').value;
    const end = document.getElementById('route-end').value;
    const btn = document.getElementById('route-btn');

    if(!start || !end) {
        alert("Please enter both starting point and destination.");
        return;
    }

    btn.innerText = "Calculating...";
    btn.classList.add('animate-pulse');

    // Simulate network delay
    setTimeout(() => {
        btn.innerText = "Calculate Route";
        btn.classList.remove('animate-pulse');

        // Clear existing route if any
        if(routingLine) map.removeLayer(routingLine);

        // Create a fake zigzag route to simulate pathfinding around danger zones
        const offsetLat = (Math.random() - 0.5) * 0.01;
        const offsetLng = (Math.random() - 0.5) * 0.01;
        
        const routeCoords = [
            feuCoords,
            [feuCoords[0] + offsetLat/2, feuCoords[1] + offsetLng],
            [feuCoords[0] + offsetLat, feuCoords[1] + offsetLng * 1.5],
            [feuCoords[0] + offsetLat*2, feuCoords[1] + offsetLng*2] // Fake destination
        ];

        routingLine = L.polyline(routeCoords, {
            color: '#4f46e5', // Indigo
            weight: 5,
            opacity: 0.8,
            dashArray: '10, 10',
            lineJoin: 'round'
        }).addTo(map);

        // Zoom map to fit the new route
        map.fitBounds(routingLine.getBounds(), { padding: [50, 50] });

    }, 1500);
}


// --- Modal & UI Toggles ---
function toggleSidebar() {
    const sidebar = document.getElementById('user-sidebar');
    sidebar.classList.toggle('-translate-x-full');
}

function openReportModal() {
    const modal = document.getElementById('report-modal');
    modal.classList.remove('hidden');
    // Slight delay to allow display:block to apply before animating opacity
    setTimeout(() => { modal.classList.add('show'); }, 10);
    currentTags = [];
    updateTagDisplay();
}

function closeReportModal() {
    const modal = document.getElementById('report-modal');
    modal.classList.remove('show');
    setTimeout(() => { modal.classList.add('hidden'); }, 300); // Wait for transition
    
    // Reset Form
    document.getElementById('report-title').value = '';
    document.getElementById('report-desc').value = '';
    document.getElementById('report-category').value = '';
    document.getElementById('safety-confirm').checked = false;
    document.getElementById('ai-tags').classList.add('hidden');
}

// --- Tag Management ---
function suggestTags() {
    const cat = document.getElementById('report-category').value;
    const aiTags = document.getElementById('ai-tags');
    const container = document.getElementById('tag-container');
    
    if(!cat) { aiTags.classList.add('hidden'); return; }
    
    aiTags.classList.remove('hidden');
    container.innerHTML = '';
    
    const predefinedTags = {
        'Harassment/Aggression': ['#catcalling', '#stalking', '#unsafe_vibe'],
        'Crowd/Atmosphere': ['#overcrowded', '#pickpocket_risk', '#loiterers'],
        'Environmental/Path Hazards': ['#no_lights', '#flooded', '#blindspot'],
        'Accessibility/Obstructions': ['#blocked_ramp', '#broken_elevator']
    };
    
    predefinedTags[cat].forEach(tag => {
        container.innerHTML += `<span class="text-[11px] font-medium bg-white text-indigo-600 border border-indigo-200 px-2 py-1 rounded-md cursor-pointer hover:bg-indigo-50 transition" onclick="addTag('${tag}')">${tag} +</span>`;
    });
}

function handleTagKeypress(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); // Prevent form submission if any
        addCustomTag();
    }
}

function addCustomTag() {
    const input = document.getElementById('custom-tag-input');
    let val = input.value.trim().replace(/\s+/g, '_'); // Replace spaces with underscores
    
    if(val) {
        if(!val.startsWith('#')) val = '#' + val;
        addTag(val.toLowerCase());
        input.value = '';
    }
}

function addTag(tag) {
    if(!currentTags.includes(tag) && currentTags.length < 5) {
        currentTags.push(tag);
        updateTagDisplay();
    }
}

function removeTag(tag) {
    currentTags = currentTags.filter(t => t !== tag);
    updateTagDisplay();
}

function updateTagDisplay() {
    const container = document.getElementById('active-tags-container');
    container.innerHTML = currentTags.map(t => `
        <span class="text-xs bg-indigo-600 text-white px-2 py-1 rounded-md flex items-center gap-1">
            ${t} <button onclick="removeTag('${t}')" class="hover:text-rose-300 font-bold ml-1">×</button>
        </span>
    `).join('');
}


// --- Form Logic ---
document.getElementById('report-desc').addEventListener('input', (e) => {
    const count = e.target.value.length;
    const counter = document.getElementById('char-count');
    counter.innerText = `${count}/15 min`;
    counter.className = count >= 15 ? "text-xs mt-1 text-right font-medium text-green-500" : "text-xs mt-1 text-right font-medium text-slate-400";
});

function submitReport() {
    const title = document.getElementById('report-title').value;
    const desc = document.getElementById('report-desc').value;
    const cat = document.getElementById('report-category').value;
    const safe = document.getElementById('safety-confirm').checked;
    
    if(!title) { alert("Please enter a subject/title."); return; }
    if(desc.length < 15) { alert("Description must be at least 15 characters."); return; }
    if(!cat) { alert("Please select a category."); return; }
    if(!safe) { alert("Please confirm you are safe to post this report."); return; }

    // Add to mock data
    mockReports.unshift({ // Add to beginning of array
        type: cat,
        title: title,
        desc: desc,
        cred: 1,
        lat: feuCoords[0] + (Math.random() - 0.5) * 0.002, // Drop pin near center
        lng: feuCoords[1] + (Math.random() - 0.5) * 0.002,
        tags: [...currentTags]
    });

    closeReportModal();
    
    // Re-initialize map heatmap data to show new point
    initMap(); // Quick and dirty refresh for prototype purposes
    
    // Show Emergency popup
    const eModal = document.getElementById('emergency-modal');
    eModal.classList.remove('hidden');
    setTimeout(() => { eModal.classList.add('show'); }, 10);
}

function closeEmergencyModal() {
    const eModal = document.getElementById('emergency-modal');
    eModal.classList.remove('show');
    setTimeout(() => { eModal.classList.add('hidden'); }, 300);
}

// Initialize on load
window.onload = initMap;
