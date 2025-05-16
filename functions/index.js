const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
});
const { v2: cloudinary } = require('cloudinary');
const fetch = require('node-fetch'); // Certifique-se que node-fetch está instalado

admin.initializeApp();

// Configuração do Cloudinary
cloudinary.config({
  cloud_name: "dmq4e5bm5",
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Middleware CORS
const handleCors = (handler) => (req, res) => {
  return cors(req, res, () => handler(req, res));
};

// Middleware de autenticação real
const authenticateMiddleware = (handler) => async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    return handler(req, res);
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// Helper para contexto comum
const getContext = (req) => ({
  db: admin.firestore(),
  userId: req.user.uid,
});

// --- Função para upload de imagem ---
exports.uploadImage = functions.https.onRequest(
  handleCors(
    authenticateMiddleware(async (req, res) => {
      const { image, userId } = req.body;
      if (!image || !userId) {
        return res.status(400).json({ error: 'Dados incompletos' });
      }

      try {
        // Upload para Cloudinary
        const cloudinaryResult = await cloudinary.uploader.upload(image, {
          folder: `logos/${userId}`,
          resource_type: 'auto',
          invalidate: true,
          // return_delete_token: true // Se quiser usar, habilite aqui e no painel Cloudinary
        });

        // Upload para Firebase Storage
        const bucket = admin.storage().bucket();
        const fileName = `logos/${userId}/${cloudinaryResult.public_id}`;
        const file = bucket.file(fileName);

        // Busca a imagem da URL do Cloudinary e converte para buffer
        const imageResponse = await fetch(cloudinaryResult.secure_url);
        const imageBuffer = await imageResponse.buffer();

        await file.save(imageBuffer, {
          metadata: {
            contentType: cloudinaryResult.format ? `image/${cloudinaryResult.format}` : 'image/png'
          }
        });

        // Gera URL assinada longa duração (até 2500)
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: '03-01-2500'
        });

        res.status(200).json({
          cloudinaryUrl: cloudinaryResult.secure_url,
          firebaseUrl: url,
          deleteToken: cloudinaryResult.delete_token || null
        });
      } catch (error) {
        console.error('Erro no upload:', error);
        res.status(500).json({ error: 'Erro no upload da imagem' });
      }
    })
  )
);

// --- Função para deletar imagem ---
exports.deleteImage = functions.https.onRequest(
  handleCors(
    authenticateMiddleware(async (req, res) => {
      const { deleteToken, userId, imagePath } = req.body;

      try {
        // Deleta do Cloudinary (delete_token é mais seguro, mas se não tiver, pode usar public_id)
        if (deleteToken) {
          await cloudinary.uploader.destroy(deleteToken);
        }

        // Deleta do Firebase Storage
        if (imagePath) {
          const bucket = admin.storage().bucket();
          const file = bucket.file(imagePath);
          await file.delete();
        }

        res.status(200).json({ message: 'Imagem deletada com sucesso' });
      } catch (error) {
        console.error('Erro ao deletar:', error);
        res.status(500).json({ error: 'Erro ao deletar imagem' });
      }
    })
  )
);

// --- API principal (logos) ---
exports.api = functions.https.onRequest(
  handleCors(
    authenticateMiddleware(async (req, res) => {
      const { db, userId } = getContext(req);
      const logosCollection = db.collection('logos');

      try {
        if (req.method === 'GET') {
          const querySnapshot = await logosCollection.where('userId', '==', userId).get();
          const logos = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || null,
            startDate: doc.data().startDate || null,
            endDate: doc.data().endDate || null
          }));
          return res.status(200).json(logos);
        }

        if (req.method === 'POST') {
          const data = req.body;

          // Sanitização básica
          data.clientCNPJ = data.clientCNPJ?.trim();
          data.clientName = data.clientName?.trim();

          if (!data.clientCNPJ || !data.clientName) {
            return res.status(400).json({ error: 'Campos obrigatórios faltando' });
          }

          data.userId = userId;
          data.createdAt = admin.firestore.FieldValue.serverTimestamp();

          // Verifica duplicidade CNPJ
          const cnpjExists = await logosCollection
            .where('userId', '==', userId)
            .where('clientCNPJ', '==', data.clientCNPJ)
            .get();

          if (!cnpjExists.empty) {
            return res.status(400).json({ error: 'CNPJ já cadastrado' });
          }

          const docRef = await logosCollection.add(data);
          return res.status(201).json({
            id: docRef.id,
            message: 'Logotipo criado com sucesso'
          });
        }

        if (req.method === 'PUT') {
          const { id, ...data } = req.body;

          if (!id) {
            return res.status(400).json({ error: 'ID do logotipo não fornecido' });
          }

          const doc = await logosCollection.doc(id).get();
          if (!doc.exists || doc.data().userId !== userId) {
            return res.status(404).json({ error: 'Logotipo não encontrado' });
          }

          await logosCollection.doc(id).update(data);
          return res.status(200).json({
            success: true,
            message: 'Logotipo atualizado com sucesso'
          });
        }

        if (req.method === 'DELETE') {
          const { id } = req.body;

          if (!id) {
            return res.status(400).json({ error: 'ID do logotipo não fornecido' });
          }

          const doc = await logosCollection.doc(id).get();
          if (!doc.exists || doc.data().userId !== userId) {
            return res.status(404).json({ error: 'Logotipo não encontrado' });
          }

          await logosCollection.doc(id).delete();
          return res.status(200).json({
            success: true,
            message: 'Logotipo deletado com sucesso'
          });
        }

        return res.status(405).json({ error: 'Método não permitido' });
      } catch (error) {
        console.error('Erro na API:', error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }
    })
  )
);

// --- Health check simples ---
exports.health = functions.https.onRequest((req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// --- Integração Contacts ---
exports.contacts = functions.https.onRequest(
  handleCors(
    authenticateMiddleware(async (req, res) => {
      const { db, userId } = getContext(req);
      const contactsCollection = db.collection('contacts');

      try {
        if (req.method === 'GET') {
          const snapshot = await contactsCollection.where('userId', '==', userId).get();
          const contacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          return res.status(200).json(contacts);
        }

        if (req.method === 'POST') {
          const data = req.body;

          data.name = data.name?.trim();
          data.email = data.email?.trim();

          if (!data.name || !data.email) {
            return res.status(400).json({ error: 'Nome e email são obrigatórios' });
          }

          data.userId = userId;
          data.createdAt = admin.firestore.FieldValue.serverTimestamp();

          const docRef = await contactsCollection.add(data);
          return res.status(201).json({ id: docRef.id, message: 'Contato criado com sucesso' });
        }

        if (req.method === 'DELETE') {
          const { id } = req.body;
          if (!id) {
            return res.status(400).json({ error: 'ID do contato não fornecido' });
          }

          const doc = await contactsCollection.doc(id).get();
          if (!doc.exists || doc.data().userId !== userId) {
            return res.status(404).json({ error: 'Contato não encontrado' });
          }

          await contactsCollection.doc(id).delete();
          return res.status(200).json({ message: 'Contato deletado com sucesso' });
        }

        return res.status(405).json({ error: 'Método não permitido' });
      } catch (error) {
        console.error('Erro em /contacts:', error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }
    })
  )
);

// --- Integração premiumAds - Propagandas ---
exports.premiumAds = functions.https.onRequest(
  handleCors(
    authenticateMiddleware(async (req, res) => {
      const { db, userId } = getContext(req);
      const adsCollection = db.collection('premiumAds');

      try {
        if (req.method === 'GET') {
          const snapshot = await adsCollection.where('userId', '==', userId).get();
          const ads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          return res.status(200).json(ads);
        }

        if (req.method === 'POST') {
          const data = req.body;

          data.clientName = data.clientName?.trim();
          data.imageUrl = data.imageUrl?.trim();

          if (!data.clientName || !data.imageUrl) {
            return res.status(400).json({ error: 'Nome do cliente e imagem são obrigatórios' });
          }

          data.userId = userId;
          data.createdAt = admin.firestore.FieldValue.serverTimestamp();

          const docRef = await adsCollection.add(data);
          return res.status(201).json({ id: docRef.id, message: 'Anúncio premium criado com sucesso' });
        }

        if (req.method === 'DELETE') {
          const { id } = req.body;
          if (!id) {
            return res.status(400).json({ error: 'ID do anúncio não fornecido' });
          }

          const doc = await adsCollection.doc(id).get();
          if (!doc.exists || doc.data().userId !== userId) {
            return res.status(404).json({ error: 'Anúncio não encontrado' });
          }

          await adsCollection.doc(id).delete();
          return res.status(200).json({ message: 'Anúncio deletado com sucesso' });
        }

        return res.status(405).json({ error: 'Método não permitido' });
      } catch (error) {
        console.error('Erro em /premiumAds:', error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }
    })
  )
);