import { CLIENT_EMAIL, PRIVATE_KEY, PROJECT_ID } from '@/settings'
import admin from 'firebase-admin'

// Reemplaza 'ruta/a/tu/archivo.json' con la ubicación real de tu archivo

// Alternativa: usa process.env.GOOGLE_APPLICATION_CREDENTIALS

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: PROJECT_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey: PRIVATE_KEY,
    }),
  })
}

export default admin
