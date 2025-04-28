// Configuración de Google Drive API
const CLIENT_ID = "TU_CLIENT_ID" // Reemplaza con tu ID de cliente de OAuth
const API_KEY = "TU_API_KEY" // Reemplaza con tu clave de API
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
const SCOPES = "https://www.googleapis.com/auth/drive.file"

// Importar html2pdf
import html2pdf from "html2pdf.js"

// Declare gapi as a global variable
var gapi = gapi || {}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("riskForm")
  const submitBtn = document.getElementById("submitBtn")
  const loadingOverlay = document.getElementById("loadingOverlay")
  const successMessage = document.getElementById("successMessage")
  const closeSuccessBtn = document.getElementById("closeSuccessBtn")
  const emailSent = document.getElementById("emailSent")

  // Cargar la API de Google
  loadGoogleDriveAPI()

  // Establecer la fecha actual en el campo de fecha
  const fechaInput = document.getElementById("fecha")
  if (fechaInput) {
    const today = new Date().toISOString().split("T")[0]
    fechaInput.value = today
  }

  // Cerrar mensaje de éxito
  closeSuccessBtn.addEventListener("click", () => {
    successMessage.style.display = "none"
  })

  submitBtn.addEventListener("click", async () => {
    // Validar el formulario
    if (!validateForm()) {
      alert("Por favor complete todos los campos obligatorios y seleccione al menos una opción para cada actividad.")
      return
    }

    // Mostrar pantalla de carga
    loadingOverlay.style.display = "flex"

    try {
      // Generar PDF
      const pdfBlob = await generatePDF()

      // Subir a Google Drive
      await uploadToDrive(pdfBlob)

      // Mostrar mensaje de éxito
      loadingOverlay.style.display = "none"
      emailSent.textContent = document.getElementById("email").value
      successMessage.style.display = "block"

      // Descargar el PDF localmente también
      downloadPDF(pdfBlob)
    } catch (error) {
      loadingOverlay.style.display = "none"
      alert("Error al procesar el formulario: " + error.message)
      console.error(error)
    }
  })

  function validateForm() {
    // Validar campos personales
    const requiredFields = [
      "encuestador",
      "trabajador",
      "proceso",
      "cargo",
      "lugar",
      "horas",
      "fecha",
      "email",
      "telefono",
    ]
    for (const field of requiredFields) {
      const input = document.getElementById(field)
      if (!input.value.trim()) {
        return false
      }
    }

    // Validar que al menos una actividad tenga datos
    let actividadCompleta = false
    for (let i = 1; i <= 10; i++) {
      const actividad = document.querySelector(`input[name="actividad_${i}"]`)
      const rutinariaSi = document.querySelector(`input[name="rutinaria_${i}"][value="SI"]`)
      const rutinariaNo = document.querySelector(`input[name="rutinaria_${i}"][value="NO"]`)
      const peligrosaSi = document.querySelector(`input[name="peligrosa_${i}"][value="SI"]`)
      const peligrosaNo = document.querySelector(`input[name="peligrosa_${i}"][value="NO"]`)

      if (actividad.value.trim() !== "") {
        if ((rutinariaSi && rutinariaSi.checked) || (rutinariaNo && rutinariaNo.checked)) {
          if ((peligrosaSi && peligrosaSi.checked) || (peligrosaNo && peligrosaNo.checked)) {
            actividadCompleta = true
            break
          }
        }
      }
    }

    if (!actividadCompleta) {
      return false
    }

    return true
  }

  async function generatePDF() {
    // Clonar el contenido del formulario para el PDF
    const content = document.getElementById("formContainer").cloneNode(true)

    // Eliminar elementos que no deben aparecer en el PDF
    const submitBtn = content.querySelector("#submitBtn")
    if (submitBtn) submitBtn.parentNode.removeChild(submitBtn)

    // Opciones para html2pdf
    const opt = {
      margin: 10,
      filename: "encuesta_riesgos_laborales.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    }

    // Generar el PDF
    const pdfBlob = await html2pdf().from(content).set(opt).outputPdf("blob")
    return pdfBlob
  }

  function downloadPDF(pdfBlob) {
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = "encuesta_riesgos_laborales.pdf"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Funciones para Google Drive
  function loadGoogleDriveAPI() {
    // Cargar el script de la API de Google
    gapi.load("client:auth2", initGoogleDriveAPI)
  }

  function initGoogleDriveAPI() {
    gapi.client
      .init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES,
      })
      .then(() => {
        // Escuchar cambios en el estado de autenticación
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus)

        // Manejar el estado inicial
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get())

        // Agregar el botón de inicio de sesión si es necesario
        if (!gapi.auth2.getAuthInstance().isSignedIn.get()) {
          console.log("Usuario no autenticado. Se solicitará autenticación al enviar el formulario.")
        }
      })
      .catch((error) => {
        console.error("Error al inicializar la API de Google:", error)
      })
  }

  function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
      console.log("Usuario autenticado con Google Drive")
    }
  }

  async function uploadToDrive(pdfBlob) {
    // Verificar si el usuario está autenticado
    if (!gapi.auth2.getAuthInstance().isSignedIn.get()) {
      console.log("Solicitando autenticación...")
      await gapi.auth2.getAuthInstance().signIn()
    }

    // Obtener datos del formulario para el nombre del archivo
    const trabajador = document.getElementById("trabajador").value
    const fecha = document.getElementById("fecha").value
    const fileName = `Encuesta_Riesgos_${trabajador}_${fecha}.pdf`

    // Convertir Blob a Base64 para la API de Drive
    const base64Data = await blobToBase64(pdfBlob)
    const fileContent = base64Data.split(",")[1]

    // Crear archivo en Google Drive
    const metadata = {
      name: fileName,
      mimeType: "application/pdf",
    }

    // Crear un objeto de archivo para subir
    const fileData = new Blob([fileContent], { type: "application/pdf" })
    const form = new FormData()
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }))
    form.append("file", fileData)

    // Obtener el token de acceso
    const token = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token

    // Subir el archivo usando fetch
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: new Headers({ Authorization: "Bearer " + token }),
      body: form,
    })

    const result = await response.json()
    console.log("Archivo subido a Google Drive:", result)
    return result
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }
})
