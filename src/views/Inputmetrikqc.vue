<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useQcInputStore } from '../stores/qc.js'

const props = defineProps({
  noIml: { type: String, required: true },
})

const emit = defineEmits(['back', 'saved'])

const store = useQcInputStore()
const {
  loading,
  submitting,
  uploadingPhoto,
  compressingPhoto,
  errorMessage,
  iml,
  mc,
  im,
  ot,
  qcInspector,
  inspectorOptions,
  searchingInspectors,
  jamCheckIn,
  jamMulaiBongkar,
  jamSelesaiBongkar,
  jamCheckOut,
  savingJam,
  photos,
  photoCount,
  isLocked,
  canAddPhoto,
  remainingPhotos,
  maxPhotos,
} = storeToRefs(store)
const { uploadPhoto, deletePhoto, submitQc, searchInspectors, saveJam } = store

const fileInput = ref(null)

// Dropdown pencarian QC Inspector — teks yang diketik user beda dari nilai
// final yang tersimpan (qcInspector), supaya user bisa ngetik/filter tanpa
// langsung mengubah nilai yang mau dikirim sampai dia benar-benar pilih.
const inspectorQuery = ref('')
const showInspectorDropdown = ref(false)
const inspectorWrapperRef = ref(null)
let inspectorSearchTimer = null

function onInspectorInput() {
  qcInspector.value = ''
  showInspectorDropdown.value = true
  clearTimeout(inspectorSearchTimer)
  inspectorSearchTimer = setTimeout(() => {
    searchInspectors(inspectorQuery.value.trim())
  }, 250)
}

function focusInspectorInput() {
  showInspectorDropdown.value = true
  searchInspectors(inspectorQuery.value.trim())
}

function pickInspector(option) {
  qcInspector.value = option.nama
  inspectorQuery.value = option.nama
  showInspectorDropdown.value = false
}

// Nutup dropdown berdasarkan tap di LUAR komponen ini — bukan berdasarkan
// blur input. Pola blur+timeout sebelumnya sering gagal di HP: tap pertama
// di nama sering cuma dianggap "nutup keyboard virtual" oleh OS, jadi
// pilihan baru kepilih di tap KEDUA (atau butuh Enter). Listener di
// document ini tidak peduli soal fokus/keyboard sama sekali — dia cuma
// cek apakah tap-nya kena di dalam wrapper atau tidak.
function handleDocumentPointerDown(event) {
  if (inspectorWrapperRef.value && !inspectorWrapperRef.value.contains(event.target)) {
    showInspectorDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})

onMounted(() => {
  store.initialize(props.noIml)
})
watch(() => props.noIml, (newNoIml) => store.initialize(newNoIml))
watch(qcInspector, (val) => {
  if (!showInspectorDropdown.value) inspectorQuery.value = val
})

function openCamera() {
  if (!canAddPhoto.value) return
  fileInput.value?.click()
}

// Laravel mengirim tanggal sebagai ISO string (2025-09-02T00:00:00.000000Z).
// Tampilkan cuma bagian tanggalnya, format dd-mm-yyyy.
function formatDate(isoDate) {
  if (!isoDate) return '-'
  const d = new Date(isoDate)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

// Sama seperti formatDate, tapi ikut nampilin jam:menit — dipakai buat
// 4 timestamp proses (check in/out, mulai/selesai bongkar).
function formatDateTime(isoDate) {
  if (!isoDate) return '-'
  const d = new Date(isoDate)
  const tanggal = formatDate(isoDate)
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${tanggal} ${hh}:${min}`
}

// "Lama di dalam" = selisih Jam Check Out - Jam Check In, ditampilkan
// dalam format Jam/Menit/Detik seperti di sistem lama.
function lamaDiDalam(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '-'
  const diffMs = new Date(checkOut) - new Date(checkIn)
  if (diffMs < 0) return '-'
  const totalDetik = Math.floor(diffMs / 1000)
  const jam = Math.floor(totalDetik / 3600)
  const menit = Math.floor((totalDetik % 3600) / 60)
  const detik = totalDetik % 60
  return `${String(jam).padStart(2, '0')} Jam ${String(menit).padStart(2, '0')} Menit ${String(detik).padStart(2, '0')} Detik`
}

async function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (file) await uploadPhoto(file)
  e.target.value = ''
}

async function handleDeletePhoto(photoId) {
  if (confirm('Hapus foto ini?')) await deletePhoto(photoId)
}

// Web app browser tidak punya akses langsung nulis ke galeri device. Web
// Share API (dukungan luas di Android Chrome & iOS Safari 16.4+) adalah
// cara paling reliable — munculin share sheet asli dengan opsi "Simpan ke
// Foto". Kalau tidak didukung (misal browser desktop), fallback ke
// download biasa (masuk ke folder Download, bukan galeri foto).
async function saveToGallery(photo) {
  errorMessage.value = null
  try {
    const response = await fetch(photo.url)
    const blob = await response.blob()
    const filename = `foto-qc-${photo.id}.jpg`
    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] })
      return
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    // AbortError muncul kalau user batal di share sheet — bukan error asli.
    if (err?.name !== 'AbortError') {
      errorMessage.value = 'Gagal menyimpan foto. Coba lagi.'
    }
  }
}

async function handleSubmit() {
  const ok = await submitQc()
  if (ok) emit('saved', iml.value)
}
</script>

<template>
  <div class="qc-screen">
    <header class="qc-header">
      <button class="btn-back" @click="emit('back')">←</button>
      <h1>INPUT QC MATERIAL</h1>
    </header>

    <div v-if="loading" class="qc-loading">Memuat data...</div>

    <template v-else-if="iml">
      <section class="vehicle-card">
        <div class="vehicle-card-top">
          <div>
            <div class="nopol">{{ iml.no_polisi }}</div>
          </div>
          <span class="badge">{{ iml.nama_material }}</span>
        </div>
        <div class="vehicle-card-grid">
          <div>
            <div class="label">Tanggal Janji</div>
            <div class="value">{{ formatDate(iml.tanggal_janji) }}</div>
          </div>
          <div>
            <div class="label">No IML</div>
            <div class="value">{{ iml.no_iml }}</div>
          </div>
        </div>
        <div>
          <div class="label">Vendor</div>
          <div class="value">{{ iml.id_supplier }} - {{ iml.vendor }}</div>
        </div>
        <div>
          <div class="label">Material</div>
          <div class="value">{{ iml.id_jenis_kertas }} – {{ iml.nama_material }}</div>
        </div>
      </section>

      <p v-if="isLocked" class="locked-banner">
        QC untuk IML ini sudah selesai. Data di bawah bersifat baca saja.
      </p>

      <section class="timeline-card">
        <h2>WAKTU PROSES</h2>

        <div class="timeline-row">
          <div class="timeline-label">Jam Check In</div>
          <input v-model="jamCheckIn" type="datetime-local" class="timeline-input" :disabled="isLocked" />
          <button
            class="btn-set-jam"
            :disabled="isLocked || savingJam === 'jam_check_in'"
            @click="saveJam('jam_check_in')"
          >
            {{ savingJam === 'jam_check_in' ? '...' : 'Simpan' }}
          </button>
        </div>

        <div class="timeline-row">
          <div class="timeline-label">Jam Mulai Bongkar</div>
          <input v-model="jamMulaiBongkar" type="datetime-local" class="timeline-input" :disabled="isLocked" />
          <button
            class="btn-set-jam"
            :disabled="isLocked || savingJam === 'jam_mulai_bongkar'"
            @click="saveJam('jam_mulai_bongkar')"
          >
            {{ savingJam === 'jam_mulai_bongkar' ? '...' : 'Simpan' }}
          </button>
        </div>

        <div class="timeline-row">
          <div class="timeline-label">Jam Selesai Bongkar</div>
          <input v-model="jamSelesaiBongkar" type="datetime-local" class="timeline-input" :disabled="isLocked" />
          <button
            class="btn-set-jam"
            :disabled="isLocked || savingJam === 'jam_selesai_bongkar'"
            @click="saveJam('jam_selesai_bongkar')"
          >
            {{ savingJam === 'jam_selesai_bongkar' ? '...' : 'Simpan' }}
          </button>
        </div>

        <div class="timeline-row">
          <div class="timeline-label">Jam Check Out</div>
          <input v-model="jamCheckOut" type="datetime-local" class="timeline-input" :disabled="isLocked" />
          <button
            class="btn-set-jam"
            :disabled="isLocked || savingJam === 'jam_check_out'"
            @click="saveJam('jam_check_out')"
          >
            {{ savingJam === 'jam_check_out' ? '...' : 'Simpan' }}
          </button>
        </div>

        <div class="timeline-duration">
          Lama di dalam: <strong>{{ lamaDiDalam(jamCheckIn, jamCheckOut) }}</strong>
        </div>
      </section>

      <section class="metrics-section">
        <h2>QC METRICS ENTRY</h2>

        <div class="metric-row">
          <div class="metric-label">
            <div class="metric-title">MC (%)</div>
            <div class="metric-sub">Moisture Content</div>
          </div>
          <input
            v-model="mc"
            type="number"
            step="0.1"
            min="0"
            max="100"
            class="metric-input"
            placeholder="0.0"
            :disabled="isLocked"
          />
        </div>

        <div class="metric-row">
          <div class="metric-label">
            <div class="metric-title">IM (%)</div>
            <div class="metric-sub">Impurity</div>
          </div>
          <input
            v-model="im"
            type="number"
            step="0.1"
            min="0"
            max="100"
            class="metric-input"
            placeholder="0.0"
            :disabled="isLocked"
          />
        </div>

        <div class="metric-row">
          <div class="metric-label">
            <div class="metric-title">OT (%)</div>
            <div class="metric-sub">Other Textile</div>
          </div>
          <input
            v-model="ot"
            type="number"
            step="0.1"
            min="0"
            max="100"
            class="metric-input"
            placeholder="0.0"
            :disabled="isLocked"
          />
        </div>

        <div class="metric-row metric-row--inspector">
          <div class="metric-label">
            <div class="metric-title">QC Inspector</div>
          </div>
          <div class="inspector-search" ref="inspectorWrapperRef">
            <input
              v-model="inspectorQuery"
              type="text"
              class="metric-input metric-input--text"
              placeholder="Cari nama..."
              :disabled="isLocked"
              @input="onInspectorInput"
              @focus="focusInspectorInput"
            />
            <ul v-if="showInspectorDropdown && !isLocked" class="inspector-dropdown">
              <li v-if="searchingInspectors" class="inspector-dropdown-note">Mencari...</li>
              <li
                v-else-if="inspectorOptions.length === 0"
                class="inspector-dropdown-note"
              >
                Tidak ada nama cocok.
              </li>
              <li
                v-for="option in inspectorOptions"
                :key="option.id"
                class="inspector-option"
                @click="pickInspector(option)"
              >
                {{ option.nama }}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section class="evidence-section">
        <div class="evidence-header">
          <h2>EVIDENCE DOCUMENTATION</h2>
          <span class="photo-counter">{{ photoCount }} / {{ maxPhotos }}</span>
        </div>

        <button
          v-if="!isLocked"
          class="btn-take-photo"
          :disabled="!canAddPhoto || uploadingPhoto || compressingPhoto"
          @click="openCamera"
        >
          <span v-if="compressingPhoto">Mengompres foto...</span>
          <span v-else-if="uploadingPhoto">Mengunggah...</span>
          <span v-else>📷 + Ambil Foto</span>
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          capture="environment"
          class="hidden-file-input"
          @change="onFileSelected"
        />
        <p v-if="isLocked" class="limit-note">Foto tidak bisa diubah karena QC sudah selesai.</p>
        <p v-else-if="!canAddPhoto" class="limit-note">
          Batas maksimal {{ maxPhotos }} foto sudah tercapai.
        </p>
        <p v-else class="limit-note">Sisa {{ remainingPhotos }} foto lagi.</p>

        <div class="photo-grid">
          <div v-for="(photo, idx) in photos" :key="photo.id" class="photo-item">
            <img :src="photo.url" :alt="`Foto ${idx + 1}`" />
            <button class="btn-save-photo" title="Simpan ke galeri" @click="saveToGallery(photo)">⬇</button>
            <button
              v-if="!isLocked"
              class="btn-delete-photo"
              @click="handleDeletePhoto(photo.id)"
            >×</button>
          </div>
        </div>
      </section>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

      <button
        class="btn-submit"
        :disabled="submitting || isLocked"
        @click="handleSubmit"
      >
        {{ isLocked ? 'QC SUDAH SELESAI' : (submitting ? 'MENYIMPAN...' : '💾 SIMPAN QC') }}
      </button>
    </template>

    <p v-else class="error-message">{{ errorMessage || 'Data tidak ditemukan.' }}</p>
  </div>
</template>

<style scoped>
.qc-screen {
  background: #fdf1f1;
  min-height: 100vh;
  padding: 16px;
  font-family: system-ui, sans-serif;
}

.qc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.qc-header h1 {
  font-size: 16px;
  font-weight: 700;
  color: #b91c1c;
  letter-spacing: 0.02em;
}
.btn-back {
  background: none;
  border: none;
  font-size: 20px;
  color: #b91c1c;
  cursor: pointer;
}

.qc-loading {
  text-align: center;
  padding: 40px 0;
  color: #888;
}

.locked-banner {
  background: #d1fae5;
  color: #065f46;
  font-size: 12px;
  font-weight: 600;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 16px;
}

.timeline-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.timeline-card h2 {
  font-size: 12px;
  font-weight: 700;
  color: #b91c1c;
  letter-spacing: 0.03em;
  margin-bottom: 12px;
}
.timeline-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
}
.timeline-row:last-of-type {
  border-bottom: none;
}
.timeline-label {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: #1f2937;
}
.timeline-input {
  border: 1px solid #f3d4d4;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: #1f2937;
  background: #fdf1f1;
}
.timeline-input:disabled {
  opacity: 0.6;
}
.btn-set-jam {
  background: #b91c1c;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
.btn-set-jam:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.timeline-duration {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
  font-size: 12px;
  color: #6b7280;
}
.timeline-duration strong {
  color: #1f2937;
}

.vehicle-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.vehicle-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}
.nopol {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
}
.badge {
  background: #fde8e8;
  color: #b91c1c;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
}
.vehicle-card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.label {
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.value {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.metrics-section,
.evidence-section {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.metrics-section h2,
.evidence-section h2 {
  font-size: 12px;
  font-weight: 700;
  color: #b91c1c;
  letter-spacing: 0.03em;
  margin-bottom: 12px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f3f4f6;
}
.metric-row:last-child {
  border-bottom: none;
}
.metric-title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}
.metric-sub {
  font-size: 11px;
  color: #9ca3af;
}
.metric-input {
  width: 100px;
  text-align: right;
  padding: 8px 10px;
  border: 1px solid #f3d4d4;
  border-radius: 8px;
  background: #fdf1f1;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.metric-input--text {
  width: 160px;
  text-align: left;
}
.metric-input:disabled {
  opacity: 0.6;
}

.metric-row--inspector {
  align-items: flex-start;
}
.inspector-search {
  position: relative;
  width: 160px;
}
.inspector-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #f3d4d4;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 180px;
  overflow-y: auto;
  z-index: 20;
}
.inspector-option {
  padding: 8px 12px;
  font-size: 13px;
  color: #1f2937;
  cursor: pointer;
}
.inspector-option:hover {
  background: #fdf1f1;
}
.inspector-dropdown-note {
  padding: 8px 12px;
  font-size: 12px;
  color: #9ca3af;
}

.evidence-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.photo-counter {
  font-size: 12px;
  font-weight: 600;
  color: #b91c1c;
}

.btn-take-photo {
  width: 100%;
  padding: 14px;
  margin-top: 8px;
  border: 2px dashed #f3d4d4;
  border-radius: 10px;
  background: #fdf6f6;
  color: #b91c1c;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}
.btn-take-photo:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hidden-file-input {
  display: none;
}
.limit-note {
  font-size: 11px;
  color: #9ca3af;
  margin: 6px 0 12px;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.photo-item {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #fce8e8;
  aspect-ratio: 1;
}
.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.btn-delete-photo {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.btn-save-photo {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.error-message {
  color: #b91c1c;
  font-size: 13px;
  background: #fde8e8;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.btn-submit {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 10px;
  background: #b91c1c;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>