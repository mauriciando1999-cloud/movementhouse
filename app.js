/* ========================================================
   app.js - Motor Global de Movement House
   ======================================================== */

// DECLARACIÓN ÚNICA DE VARIABLES GLOBALES (Para evitar SyntaxError)
let dbClient;
let dayCounter = 0;
let currentPaymentUserId = null;

/* ========================================================
   1. INICIALIZACIÓN GLOBAL (Controlador de Vistas)
   ======================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    // Configurar Supabase leyendo config.js
    if (typeof window.MH_CONFIG !== 'undefined' && window.MH_CONFIG.SUPABASE_URL !== 'TU_URL_DE_SUPABASE') {
        dbClient = window.supabase.createClient(window.MH_CONFIG.SUPABASE_URL, window.MH_CONFIG.SUPABASE_ANON_KEY);
    } else {
        console.warn("ADVERTENCIA: Credenciales de Supabase no configuradas en config.js.");
    }

    // ENRUTADOR: ¿En qué pantalla estamos?
    
    // A) Si estamos en Rutinas (rutina.html)
    if (document.getElementById('days-container')) {
        window.addDayBlock();
        await cargarAtletasEnSelect(); 
    }
    
    // B) Si estamos en el Directorio (usuarios.html)
    if (document.getElementById('directory-tbody')) {
        cargarDirectorio();
        if (window.location.hash === '#nuevo') {
            window.openUserModal();
            history.replaceState(null, null, ' ');
        }
    }

    // C) Si estamos en el Portal de Pagos del Atleta (portal-pagos.html)
    if (document.getElementById('tasa-bcv')) {
        cargarTasaBCV();
    }
});


/* ========================================================
   2. MÓDULO DE RUTINAS (rutina.html)
   ======================================================== */

window.addDayBlock = function() {
    dayCounter++;
    const container = document.getElementById('days-container');
    if(!container) return;
    
    const template = document.getElementById('day-template');
    const clone = template.content.cloneNode(true);
    clone.querySelector('.day-title-input').value = `DÍA ${dayCounter}`;
    
    // Añadir la primera fila obligatoria
    clone.querySelector('.rows-container').appendChild(createExerciseRow());
    container.appendChild(clone);
}

window.deleteDay = function(btn) { 
    if(confirm('¿Seguro que deseas eliminar este día completo?')) {
        btn.closest('.day-block').remove(); 
    }
}

function createExerciseRow() { 
    return document.getElementById('row-template').content.cloneNode(true); 
}

window.addExerciseRow = function(btn) { 
    btn.previousElementSibling.appendChild(createExerciseRow()); 
}

window.deleteRow = function(btn) {
    const row = btn.closest('.exercise-row');
    row.style.opacity = '0';
    setTimeout(() => row.remove(), 200);
}

window.duplicateRow = function(btn) {
    const row = btn.closest('.exercise-row');
    const clone = row.cloneNode(true);
    
    // Clonar valores de inputs manualmente
    const originalInputs = row.querySelectorAll('input, textarea');
    const clonedInputs = clone.querySelectorAll('input, textarea');
    originalInputs.forEach((input, index) => { clonedInputs[index].value = input.value; });
    
    row.parentNode.insertBefore(clone, row.nextSibling);
}

async function cargarAtletasEnSelect() {
    const select = document.getElementById('routine-assign');
    if(!select || !dbClient) return;
    try {
        const { data, error } = await dbClient.from('profiles').select('id, name').order('name');
        if (!error) {
            data.forEach(atleta => {
                const option = document.createElement('option');
                option.value = atleta.id;
                option.textContent = atleta.name;
                select.appendChild(option);
            });
        }
    } catch (e) { console.error("Error al cargar atletas en select:", e); }
}

window.saveRoutine = async function() {
    const btn = document.getElementById('btn-save-routine');
    const routineName = document.getElementById('routine-name').value;
    const assignedTo = document.getElementById('routine-assign').value;
    const startDate = document.getElementById('routine-date').value || null; 

    if (!routineName.trim()) return alert("El bloque debe tener un nombre (Ej: Semana 1).");

    const blocksArray = [];
    document.querySelectorAll('.day-block').forEach(day => {
        const exercises = [];
        day.querySelectorAll('.exercise-row').forEach(row => {
            const exeName = row.querySelector('.col-exercise').value;
            if(exeName.trim() !== '') {
                exercises.push({
    exercise: exeName, 
    intensity: row.querySelector('.col-intensity').value,
    reps: row.querySelector('.col-reps').value, 
    rest: row.querySelector('.col-rest').value,
    notes: row.querySelector('.col-notes').value
                });
            }
        });
        blocksArray.push({
            day: day.querySelector('.day-title-input').value,
            warmup: day.querySelector('.acondicionamiento-input').value,
            exercises: exercises
        });
    });

    btn.innerText = 'GUARDANDO...';
    
    // Modo simulación si no hay DB
    if (!dbClient) { 
        setTimeout(() => { 
            btn.innerText = '¡SIMULACIÓN OK!'; 
            btn.style.background = 'var(--success)'; 
            setTimeout(() => { btn.innerText = 'GUARDAR PLANIFICACIÓN'; btn.style.background = ''; }, 2000); 
        }, 800); 
        return; 
    }

    try {
        const { error } = await dbClient.from('routines').insert([{ 
            name: routineName, 
            assigned_to: assignedTo, 
            start_date: startDate, 
            blocks: blocksArray 
        }]);
        
        if (error) throw error;
        
        btn.innerText = '¡GUARDADO CON ÉXITO!';
        btn.style.background = 'var(--success)';
    } catch (e) {
        console.error("Error guardando rutina:", e);
        btn.innerText = 'ERROR'; 
        btn.style.background = 'var(--danger)';
    }
    
    setTimeout(() => { btn.innerText = 'GUARDAR PLANIFICACIÓN'; btn.style.background = ''; }, 2500);
}


/* ========================================================
   3. MÓDULO DE DIRECTORIO Y PAGOS (usuarios.html)
   ======================================================== */

async function cargarDirectorio() {
    const tbody = document.getElementById('directory-tbody');
    
    if (!dbClient) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--danger); padding: 2rem;">Sin conexión a Supabase. Configura config.js.</td></tr>';
        return;
    }

    try {
        const { data, error } = await dbClient.from('profiles').select('*').order('name');
        if (error) throw error;
        
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 2rem;">No hay atletas registrados.</td></tr>';
            return;
        }

        data.forEach(atleta => {
            const esVencido = atleta.payment_status === 'vencido';
            const badgeClass = esVencido ? 'badge-orange' : 'badge-green';
            const badgeText = esVencido ? 'Vencido' : 'Al Día';
            
            // Validación por si la fecha viene nula o incorrecta
            let fechaStr = "---";
            if (atleta.next_billing_date) {
                fechaStr = new Date(atleta.next_billing_date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="user-col">
                        <div class="user-avatar" style="${esVencido ? 'border-color: var(--accent); color: var(--accent);' : ''}">${atleta.name.substring(0,2).toUpperCase()}</div>
                        <div class="user-info">
                            <strong>${atleta.name}</strong>
                            <small>ID: ATH-${atleta.id.substring(0,4).toUpperCase()}</small>
                        </div>
                    </div>
                </td>
                <td class="user-info"><strong>${atleta.email}</strong></td>
                <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                <td style="color: ${esVencido ? 'white' : 'var(--text-muted)'}; font-weight: 500;">${fechaStr}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-icon pay" title="Registrar Pago" onclick="abrirModalPago('${atleta.id}', '${atleta.name}')">💰</button>
                        <button class="btn-icon delete" title="Eliminar Atleta" onclick="eliminarAtleta('${atleta.id}', '${atleta.name}')">×</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { 
        console.error("Error al cargar directorio:", e);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--danger);">Error cargando datos. Revisa permisos RLS en Supabase.</td></tr>'; 
    }
}

// ---- CRUD de Atletas ----
window.openUserModal = function() { 
    document.getElementById('newUserModal').classList.add('active'); 
    document.getElementById('reg-date').valueAsDate = new Date(); 
};

window.closeUserModal = function() { 
    document.getElementById('newUserModal').classList.remove('active'); 
    document.getElementById('newUserForm').reset(); 
};

window.crearAtleta = async function(e) {
    e.preventDefault();
    if (!dbClient) return alert("Modo Simulación: Conecta Supabase para guardar realmente.");
    
    const btn = document.getElementById('btn-submit-user');
    btn.innerText = 'CREANDO...'; btn.disabled = true;

    try {
        const { error } = await dbClient.from('profiles').insert([{
            name: document.getElementById('reg-name').value,
            email: document.getElementById('reg-email').value,
            next_billing_date: document.getElementById('reg-date').value,
            payment_status: 'al_dia' 
        }]);
        
        if (error) throw error;
        
        window.closeUserModal();
        cargarDirectorio();
    } catch (e) { 
        console.error(e);
        alert("Error al crear. Es probable que el correo electrónico ya esté registrado."); 
    } finally { 
        btn.innerText = 'CREAR CUENTA'; btn.disabled = false; 
    }
};

window.eliminarAtleta = async function(id, nombre) {
    if (!confirm(`¿Estás completamente seguro de eliminar a ${nombre}?`)) return;
    
    if (!dbClient) return alert("Modo simulación: Conecta Supabase para eliminar.");

    try {
        const { error } = await dbClient.from('profiles').delete().eq('id', id);
        if (error) throw error;
        cargarDirectorio(); 
    } catch (e) { 
        console.error(e);
        alert("Hubo un error al intentar eliminar al atleta."); 
    }
};

// ---- Lógica de Pagos del Admin ----
window.usuarioSeleccionadoParaPagoId = null;

window.abrirModalPago = function(id, nombre) {
    window.usuarioSeleccionadoParaPagoId = id; // ¡Esta es la línea clave que faltaba!
    document.getElementById('payment-user-name').innerText = nombre;
    document.getElementById('modalPago').classList.add('active');
}

window.cerrarModalPago = function() {
    window.usuarioSeleccionadoParaPagoId = null; // Limpiamos la memoria
    document.getElementById('modalPago').classList.remove('active');
}
// Variable global para recordar a quién le estamos cobrando
window.usuarioSeleccionadoParaPagoId = null;

window.abrirModalPago = function(id, nombre) {
    window.usuarioSeleccionadoParaPagoId = id;
    document.getElementById('payment-user-name').innerText = nombre;
    document.getElementById('modalPago').classList.add('active');
}

window.cerrarModalPago = function() {
    window.usuarioSeleccionadoParaPagoId = null;
    document.getElementById('modalPago').classList.remove('active');
}

async function procesarPagoAdmin(event) {
    event.preventDefault();
    
    const btn = document.getElementById('btn-confirm-payment');
    btn.innerText = "PROCESANDO...";
    btn.disabled = true;

    const userId = window.usuarioSeleccionadoParaPagoId; 
    
    if (!userId) {
        alert("Error crítico: No se detectó el ID del atleta.");
        btn.innerText = "CONFIRMAR PAGO";
        btn.disabled = false;
        return;
    }

    const metodoPago = document.getElementById('payment-method').value;

    try {
        // INICIALIZAMOS LA CONEXIÓN A SUPABASE AQUÍ MISMO PARA EVITAR EL ERROR
        const db = window.supabase.createClient(window.MH_CONFIG.SUPABASE_URL, window.MH_CONFIG.SUPABASE_ANON_KEY);

        // 1. Buscamos al usuario usando la variable 'db' que acabamos de crear
        const { data: usuario, error: errorBusqueda } = await db
            .from('profiles')
            .select('fecha_corte')
            .eq('id', userId)
            .single();

        if (errorBusqueda) throw errorBusqueda;

        // 2. MATEMÁTICA INTELIGENTE DE FECHAS
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0); 
        
        let nuevaFechaCorte = new Date();

        if (usuario.fecha_corte) {
            const fechaBase = new Date(usuario.fecha_corte + 'T12:00:00');
            
            if (fechaBase >= hoy) {
                // Al día: Sumamos 1 mes a su fecha de corte actual
                nuevaFechaCorte = new Date(fechaBase);
                nuevaFechaCorte.setMonth(nuevaFechaCorte.getMonth() + 1);
            } else {
                // Vencido: Sumamos 1 mes a partir de HOY
                nuevaFechaCorte = new Date(hoy);
                nuevaFechaCorte.setMonth(nuevaFechaCorte.getMonth() + 1);
            }
        } else {
            // Nuevo/Sin fecha
            nuevaFechaCorte = new Date(hoy);
            nuevaFechaCorte.setMonth(nuevaFechaCorte.getMonth() + 1);
        }

        const fechaFormateada = nuevaFechaCorte.toISOString().split('T')[0];

        // 3. Actualizamos el perfil en Supabase
        const { error: errorUpdate } = await db
            .from('profiles')
            .update({ fecha_corte: fechaFormateada })
            .eq('id', userId);

        if (errorUpdate) throw errorUpdate;

        // 4. Éxito
        btn.style.background = "var(--success)";
        btn.innerText = "¡PAGO REGISTRADO!";
        
        setTimeout(() => {
            cerrarModalPago();
            // ESTA ES LA LÍNEA MÁGICA QUE RECARGA LA PANTALLA
            window.location.reload(); 
        }, 1200);

    } catch (error) {
        console.error("Error al procesar el pago:", error);
        alert("Hubo un error al registrar el pago.");
        btn.style.background = "";
        btn.innerText = "CONFIRMAR PAGO";
        btn.disabled = false;
    }
}
/* ========================================================
   4. PORTAL DE PAGOS BCV Y WHATSAPP (portal-pagos.html)
   ======================================================== */

async function cargarTasaBCV() {
    const tasaEl = document.getElementById('tasa-bcv');
    const totalEl = document.getElementById('total-ves');
    const btnReportar = document.getElementById('btn-reportar');

    try {
        const respuesta = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const datos = await respuesta.json();
        
        const tasaOficial = datos.promedio;
        const cuotaFijaUSD = 30; // $30 mensuales
        const totalVES = (cuotaFijaUSD * tasaOficial).toFixed(2);

        tasaEl.classList.remove('skeleton');
        totalEl.classList.remove('skeleton');
        tasaEl.innerText = `Bs. ${tasaOficial.toFixed(2)}`;
        totalEl.innerText = `${totalVES}`;

        const mensaje = `¡Hola Movement House! Aquí adjunto el comprobante de mi mensualidad de $${cuotaFijaUSD} (Bs. ${totalVES}) cancelado a tasa BCV del día.`;
        const numGym = "584120000000"; // Reemplaza con el número real de Movement House
        
        btnReportar.href = `https://wa.me/${numGym}?text=${encodeURIComponent(mensaje)}`;
        btnReportar.style.pointerEvents = 'auto';
        btnReportar.style.opacity = '1';

    } catch (error) {
        console.error("Error BCV API:", error);
        tasaEl.classList.remove('skeleton');
        totalEl.classList.remove('skeleton');
        tasaEl.innerText = "Error de conexión BCV";
        tasaEl.style.color = "var(--danger)";
        totalEl.innerText = "---";
        
        // Failsafe
        const msgError = `¡Hola Movement House! Aquí adjunto el comprobante de mi mensualidad de $30.`;
        btnReportar.href = `https://wa.me/584120000000?text=${encodeURIComponent(msgError)}`;
        btnReportar.style.pointerEvents = 'auto';
        btnReportar.style.opacity = '1';
    }
}
/* ========================================================
   6. MÓDULO: DASHBOARD DEL ATLETA (index-user.html)
   ======================================================== */
let currentAthleteId = null;

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('today-routine-name')) {
        // Leer el ID de la URL (Ej: index-user.html?id=12345)
        const urlParams = new URLSearchParams(window.location.search);
        currentAthleteId = urlParams.get('id');
        
        if (!currentAthleteId) {
            document.body.innerHTML = '<div style="padding: 2rem; text-align: center; color: white;"><h1>ACCESO DENEGADO</h1><p>Enlace de atleta inválido. Solicita tu enlace de acceso a tu entrenador.</p></div>';
            return;
        }
        cargarDashboardAtleta();
    }
});

async function cargarDashboardAtleta() {
    if (!dbClient) return;

    try {
        // 1. Obtener datos del perfil
        const { data: profileData } = await dbClient.from('profiles').select('*').eq('id', currentAthleteId).single();
        if (profileData) {
            document.getElementById('user-firstname').innerText = profileData.name.split(' ')[0].toUpperCase();
            document.getElementById('header-avatar').innerText = profileData.name.substring(0,2).toUpperCase();
        }

        // 2. Cargar Rutinas (Asignadas a él o Globales)
        const { data: rutinasData } = await dbClient.from('routines')
            .select('*')
            .or(`assigned_to.eq.${currentAthleteId},assigned_to.eq.global`)
            .order('created_at', { ascending: false })
            .limit(1);

        if (rutinasData && rutinasData.length > 0) {
            const rutinaActual = rutinasData[0];
            document.getElementById('today-routine-name').innerText = rutinaActual.name;
            // Aquí inyectaríamos los bloques en el modal (simplificado para el ejemplo)
            window.rutinaActiva = rutinaActual; 
        } else {
            document.getElementById('today-routine-name').innerText = "DÍA DE DESCANSO";
            document.querySelector('.routine-desc').innerText = "No tienes planificaciones activas en este momento.";
            document.querySelector('.btn-play').style.display = 'none';
        }

        // 3. Cargar Historial de PRs
        cargarHistorialPRs();

    } catch (error) {
        console.error("Error cargando dashboard:", error);
    }
}

async function cargarHistorialPRs() {
    try {
        const { data: prsData } = await dbClient.from('personal_records')
            .select('*').eq('user_id', currentAthleteId).order('rm_calculated', { ascending: false });

        const container = document.getElementById('pr-grid-container');
        if (!prsData || prsData.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); grid-column: span 2; text-align: center;">Aún no has registrado ninguna marca.</p>';
            return;
        }

        // Agrupar por mejor RM de cada ejercicio
        const mejoresMarcas = {};
        prsData.forEach(pr => {
            if (!mejoresMarcas[pr.exercise] || mejoresMarcas[pr.exercise].rm_calculated < pr.rm_calculated) {
                mejoresMarcas[pr.exercise] = pr;
            }
        });

        container.innerHTML = '';
        Object.values(mejoresMarcas).forEach(pr => {
            container.innerHTML += `
                <div class="pr-card">
                    <h3>${pr.exercise.toUpperCase()}</h3>
                    <div class="pr-value">${Math.round(pr.rm_calculated)} <small>kg</small></div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 5px;">Récord: ${pr.weight}kg x ${pr.reps} reps</div>
                </div>
            `;
        });
    } catch (e) {}
}

// Ventana Modal de PRs
window.abrirModalPR = function() { document.getElementById('prModal').classList.add('active'); }
window.cerrarModalPR = function() { document.getElementById('prModal').classList.remove('active'); }

window.guardarPR = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-pr');
    const ejercicio = document.getElementById('pr-exercise').value;
    const peso = parseFloat(document.getElementById('pr-weight').value);
    const reps = parseInt(document.getElementById('pr-reps').value);
    
    // Cálculo de Epley
    let rmCalc = reps === 1 ? peso : peso * (1 + (reps / 30));

    btn.innerText = 'GUARDANDO...'; btn.disabled = true;

    try {
        await dbClient.from('personal_records').insert([{
            user_id: currentAthleteId,
            exercise: ejercicio,
            weight: peso,
            reps: reps,
            rm_calculated: rmCalc
        }]);
        window.cerrarModalPR();
        document.getElementById('form-pr').reset();
        cargarHistorialPRs(); // Recargar visualmente
    } catch (error) {
        alert("Error guardando el récord.");
    } finally {
        btn.innerText = 'REGISTRAR MARCA'; btn.disabled = false;
    }
}