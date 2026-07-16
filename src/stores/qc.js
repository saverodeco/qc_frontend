import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api.js'
import imageCompression from 'browser-image-compression'

const MAX_PHOTOS = 20

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  initialQuality: 0.8,
}

async function compressPhoto(file) {
  try {
    return await imageCompression(file, COMPRESSION_OPTIONS)
  } catch (err) {
    console.warn('Kompresi foto gagal, upload file asli:', err)
    return file
  }
}

const STATUS_LABEL = {
  WAITING_QC: 'Belum QC',
  QC_IN_PROGRESS: 'Belum QC',
  QC_DONE: 'Sudah QC',
}

export const useQcListStore = defineStore('qcList', () => {
  const loading = ref(false)
  const errorMessage = ref(null)

  const tanggal = ref(new Date().toISOString().slice(0, 10))
  const list = ref([])
  const belumQc = ref(0)
  const sudahQc = ref(0)

  async function fetchList() {
    loading.value = true
    errorMessage.value = null
    try {
      const { data } = await api.get('/qc', { params: { tanggal: tanggal.value } })
      list.value = data.data
      belumQc.value = data.belum_qc
      sudahQc.value = data.sudah_qc
    } catch (err) {
      errorMessage.value = err.response?.data?.message ?? 'Gagal memuat daftar kendaraan.'
    } finally {
      loading.value = false
    }
  }

  function statusLabel(status) {
    return STATUS_LABEL[status] ?? status
  }

  function isDone(status) {
    return status === 'QC_DONE'
  }

  return {
    loading,
    errorMessage,
    tanggal,
    list,
    belumQc,
    sudahQc,
    fetchList,
    statusLabel,
    isDone,
  }
})

/**
 * Store untuk layar "Input Metrik QC". Field disamakan dengan skema
 * perusahaan: mc, im (dulu imp), ot, qc_inspector (dulu qc_by — cuma
 * QCInspector yang diadopsi dari 3 kolom inspector perusahaan).
 */
export const useQcInputStore = defineStore('qcInput', () => {
  const currentNoIml = ref(null)

  const loading = ref(false)
  const submitting = ref(false)
  const uploadingPhoto = ref(false)
  const compressingPhoto = ref(false)
  const errorMessage = ref(null)

  const iml = ref(null)

  const mc = ref('')
  const im = ref('')
  const ot = ref('')
  const qcInspector = ref('')

  const jamCheckIn = ref('')
  const jamMulaiBongkar = ref('')
  const jamSelesaiBongkar = ref('')
  const jamCheckOut = ref('')
  const savingJam = ref(null) // field key yang lagi disimpan, buat loading state per tombol

  function isoToLocalInput(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const inspectorOptions = ref([])
  const searchingInspectors = ref(false)
  let inspectorSearchToken = 0

  async function searchInspectors(query) {
    const token = ++inspectorSearchToken
    searchingInspectors.value = true
    try {
      const { data } = await api.get('/qc/inspectors', { params: { q: query } })
      // Buang hasil kalau sudah ada pencarian yang lebih baru menyusul
      // (menghindari race condition waktu user ngetik cepat).
      if (token === inspectorSearchToken) {
        inspectorOptions.value = data.data
      }
    } catch (err) {
      if (token === inspectorSearchToken) {
        inspectorOptions.value = []
      }
    } finally {
      if (token === inspectorSearchToken) {
        searchingInspectors.value = false
      }
    }
  }

  const photos = computed(() => iml.value?.photos ?? [])
  const photoCount = computed(() => photos.value.length)
  const isLocked = computed(() => iml.value?.status === 'QC_DONE')
  const canAddPhoto = computed(() => photoCount.value < MAX_PHOTOS && !isLocked.value)
  const remainingPhotos = computed(() => MAX_PHOTOS - photoCount.value)

  function resetState() {
    loading.value = false
    submitting.value = false
    uploadingPhoto.value = false
    compressingPhoto.value = false
    errorMessage.value = null
    iml.value = null
    mc.value = ''
    im.value = ''
    ot.value = ''
    qcInspector.value = ''
    inspectorOptions.value = []
    jamCheckIn.value = ''
    jamMulaiBongkar.value = ''
    jamSelesaiBongkar.value = ''
    jamCheckOut.value = ''
    savingJam.value = null
  }

  async function initialize(noIml) {
    if (currentNoIml.value === noIml && iml.value) return
    currentNoIml.value = noIml
    resetState()
    await fetchLookup()
  }

  async function fetchLookup() {
    loading.value = true
    errorMessage.value = null
    try {
      const { data } = await api.get(`/qc/lookup/${currentNoIml.value}`)
      iml.value = data.data
      // Kalau IML ini sudah pernah di-submit (QC_DONE), tampilkan nilai yang
      // sudah tersimpan — bukan field kosong yang cuma di-disable.
      if (iml.value) {
        mc.value = iml.value.mc ?? ''
        im.value = iml.value.im ?? ''
        ot.value = iml.value.ot ?? ''
        qcInspector.value = iml.value.qc_inspector ?? ''
        jamCheckIn.value = isoToLocalInput(iml.value.jam_check_in)
        jamMulaiBongkar.value = isoToLocalInput(iml.value.jam_mulai_bongkar)
        jamSelesaiBongkar.value = isoToLocalInput(iml.value.jam_selesai_bongkar)
        jamCheckOut.value = isoToLocalInput(iml.value.jam_check_out)
      }
    } catch (err) {
      errorMessage.value = err.response?.data?.message ?? 'Gagal memuat data IML.'
      iml.value = null
    } finally {
      loading.value = false
    }
  }

  async function uploadPhoto(file) {
    if (isLocked.value) {
      errorMessage.value = 'QC untuk IML ini sudah selesai, foto tidak bisa diubah lagi.'
      return false
    }
    if (!canAddPhoto.value) {
      errorMessage.value = `Maksimal ${MAX_PHOTOS} foto per IML sudah tercapai.`
      return false
    }

    uploadingPhoto.value = true
    errorMessage.value = null

    compressingPhoto.value = true
    const compressedFile = await compressPhoto(file)
    compressingPhoto.value = false

    const formData = new FormData()
    formData.append('photo', compressedFile, file.name)

    try {
      const { data } = await api.post(`/qc/${currentNoIml.value}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      iml.value.photos.push(data.data)
      return true
    } catch (err) {
      errorMessage.value = err.response?.data?.message ?? 'Gagal mengunggah foto.'
      return false
    } finally {
      uploadingPhoto.value = false
    }
  }

  async function deletePhoto(photoId) {
    if (isLocked.value) {
      errorMessage.value = 'QC untuk IML ini sudah selesai, foto tidak bisa dihapus.'
      return false
    }
    errorMessage.value = null
    try {
      await api.delete(`/qc/${currentNoIml.value}/photos/${photoId}`)
      iml.value.photos = iml.value.photos.filter((p) => p.id !== photoId)
      return true
    } catch (err) {
      errorMessage.value = err.response?.data?.message ?? 'Gagal menghapus foto.'
      return false
    }
  }

  async function saveJam(field) {
    if (isLocked.value) {
      errorMessage.value = 'QC untuk IML ini sudah selesai, waktu tidak bisa diubah lagi.'
      return false
    }
    const valueMap = {
      jam_check_in: jamCheckIn,
      jam_mulai_bongkar: jamMulaiBongkar,
      jam_selesai_bongkar: jamSelesaiBongkar,
      jam_check_out: jamCheckOut,
    }
    const targetRef = valueMap[field]
    if (!targetRef || !targetRef.value) {
      errorMessage.value = 'Isi tanggal & waktu dulu sebelum disimpan.'
      return false
    }

    savingJam.value = field
    errorMessage.value = null
    try {
      const { data } = await api.patch(`/qc/${currentNoIml.value}/jam`, {
        [field]: targetRef.value,
      })
      iml.value[field] = data.data[field]
      return true
    } catch (err) {
      errorMessage.value = err.response?.data?.message ?? 'Gagal menyimpan waktu.'
      return false
    } finally {
      savingJam.value = null
    }
  }

  async function submitQc() {
    errorMessage.value = null

    if (photoCount.value === 0) {
      errorMessage.value = 'Minimal 1 foto dokumentasi wajib diunggah.'
      return false
    }
    if (mc.value === '' || im.value === '' || ot.value === '') {
      errorMessage.value = 'MC, IM, dan OT wajib diisi.'
      return false
    }
    if (!qcInspector.value.trim()) {
      errorMessage.value = 'Nama QC Inspector wajib diisi.'
      return false
    }

    submitting.value = true
    try {
      const { data } = await api.post(`/qc/${currentNoIml.value}/submit`, {
        mc: mc.value,
        im: im.value,
        ot: ot.value,
        qc_inspector: qcInspector.value.trim(),
      })
      iml.value = data.data
      return true
    } catch (err) {
      errorMessage.value = err.response?.data?.message ?? 'Gagal menyimpan QC.'
      return false
    } finally {
      submitting.value = false
    }
  }

  return {
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
    maxPhotos: MAX_PHOTOS,
    initialize,
    uploadPhoto,
    deletePhoto,
    submitQc,
    searchInspectors,
    saveJam,
  }
})