
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";
import { app } from './firebase-config.js';
import { categories } from './categories.js';
import { ufs } from './ufs.js';  

// Inicializa serviços do Firebase
const db = getFirestore(app);
const storage = getStorage(app);
const userId = localStorage.getItem('userId'); // para associar os dados ao usuário logado

document.addEventListener("DOMContentLoaded", async () => {  
    // Elementos DOM 
    const logoForm = document.getElementById("logo-form");
    const logosGrid = document.getElementById("logos-grid");
    const searchInput = document.getElementById("search-input");
    const filterCategory = document.getElementById("filter-category");
    const logoCategorySelect = document.getElementById("logo-category");
    const ufSelect = document.getElementById('client-uf');
    const cnpjInput = document.getElementById("client-cnpj");
    const saveBtn = document.querySelector('.save-btn');
    const cancelBtn = document.querySelector('.cancel-btn');
    const startDateInput = document.getElementById('start-date');
    const contractMonthsSelect = document.getElementById('contract-months');
    const endDateInput = document.getElementById('end-date');

    
        // Função para inicializar o widget de upload do Cloudinary
        const YOUR_UPLOAD_PRESET = "brandConnectPresetName";
        const YOUR_CLOUD_NAME = "dmq4e5bm5";

        async function uploadImageToCloudinary(file) {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", YOUR_UPLOAD_PRESET);

            const response = await fetch(`https://api.cloudinary.com/v1_1/${YOUR_CLOUD_NAME}/image/upload`, {
                method: "POST",
                body: formData
            });

            const data = await response.json();

            if (data.secure_url) {
                return {
                    imageUrl: data.secure_url,
                    deleteToken: data.delete_token // útil se você ativou "Retornar token de exclusão"
                };
            } else {
                throw new Error("Erro ao fazer upload da imagem para o Cloudinary.");
            }

            
            if (data.delete_token) {
                console.log("Token de exclusão recebido:", data.delete_token);
            }
        }
    // Tornando a função visível globalmente (para onclick do HTML)
    window.uploadImageToCloudinary = uploadImageToCloudinary;
    
    async function deleteLogoFromCloudinary(deleteToken) {
         const cloudName = "dmq4e5bm5"; 
    
        try {
            const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/delete_by_token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({ token: deleteToken })
            });
    
            const data = await response.json();
    
            if (data.result === "ok") {
                console.log("Imagem excluída com sucesso.");
            } else {
                console.error("Erro ao excluir imagem:", data);
                throw new Error("Erro ao excluir imagem do Cloudinary.");
            }
        } catch (error) {
            console.error("Erro na requisição ao Cloudinary:", error);
            throw error;
        }
    }
    

    cnpjInput.addEventListener("blur", validarCNPJNoCampo);
    let editingIndex = null;
    let logos = [];

    // Preenche o select de UFs
    ufs.forEach(uf => {
        const option = document.createElement('option');
        option.value = uf.sigla;
        option.textContent = uf.nome;
        ufSelect.appendChild(option);
    });

    // Funções do Firestore
    async function addLogoToFirestore(logoData) {
        try {
            const docRef = await addDoc(collection(db, 'logos'), {
                ...logoData,
                userId: userId,
                createdAt: new Date()
            });
            return docRef.id;
        } catch (error) {
            console.error("Error adding document: ", error);
            throw error;
        }
    }

    async function updateLogoInFirestore(logoId, updatedData) {
        try {
            await updateDoc(doc(db, 'logos', logoId), updatedData);
        } catch (error) {
            console.error("Error updating document: ", error);
            throw error;
        }
    }

    async function deleteLogoFromFirestore(logoId) {
        try {
            await deleteDoc(doc(db, 'logos', logoId));
        } catch (error) {
            console.error("Error deleting document: ", error);
            throw error;
        }
    }

    async function loadLogosFromFirestore() {
        try {
            const logosRef = collection(db, 'logos');
            const q = query(logosRef, where('userId', '==', userId));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error loading logos: ", error);
            return [];
        }
    }

    // async function uploadImageFirebase(file, logoId) {
    //     try {
    //         // Se for uma data URL (quando edita mantendo a mesma imagem)
    //         if (typeof file === 'string' && file.startsWith('data:')) {
    //             return file;
    //         }
            
    //         // Upload para Firebase Storage
    //         const storageRef = ref(storage, `logos/${userId}/${logoId}/${file.name}`);
    //         await uploadBytes(storageRef, file);
    //         return await getDownloadURL(storageRef);
    //     } catch (error) {
    //         console.error("Error uploading image: ", error);
    //         throw error;
    //     }
    // }

    // Inicializa a aplicação
    async function init() {
        logos = await loadLogosFromFirestore();
        renderLogos(logos);
        populateCategories();
        populateFilterCategories();
        applyFilters();
    }

     // Renderiza os logos em uma tabela 
     function renderLogos(list) {
        logosGrid.innerHTML = "";

        if (list.length === 0) {
            logosGrid.innerHTML = "<p>Nenhum logotipo encontrado.</p>";
            return;
        }

        // Cria a tabela
        const table = document.createElement('table');
        table.className = 'logos-table';
        
        // Cabeçalho da tabela
        const thead = document.createElement('thead');
        thead.innerHTML = `
          <tr>
                <th class="col-logo">Logo</th>
                <th class="col-razao">Razão Social</th>
                <th class="col-fantasia">Nome Fantasia</th>
                <th class="col-cnpj">CNPJ</th>
                <th class="col-celular">Celular</th>
                <th class="col-cidade">Cidade/UF</th>
                <th class="col-categoria">Categoria</th>
                <th class="col-contrato">Contrato</th>
                <th class="col-contrato">Valor Contrato</th>
                <th class="col-acoes">Ações</th>
          </tr>
        `;
        table.appendChild(thead);
        
        // Corpo da tabela
        const tbody = document.createElement('tbody');
        
        list.forEach((logo) => {
            const startDate = new Date(logo.startDate);
            const endDate = new Date(logo.endDate);
            const formattedStartDate = startDate.toLocaleDateString('pt-BR');
            const formattedEndDate = endDate.toLocaleDateString('pt-BR');
            const status = logo.contractActive ? 'Ativo' : 'Inativo';
            const statusClass = logo.contractActive ? 'active' : 'inactive';
            const dataContrato = logo.contractActive ? `${formattedStartDate} a ${formattedEndDate}` : "";
            const categoria = getCategoryLabelByValue(logo.category);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><img src="${logo.imagem}" alt="Logo de ${logo.clientName}" class="logo-thumbnail" /></td>
                <td>${logo.clientName}</td>
                <td>${logo.clientFantasyName || '-'}</td>
                <td>${logo.clientCNPJ || '-'}</td>
                <td>${logo.cellphone || '-'}</td>
                <td>${logo.clientCity}/${logo.clientUf}</td>
                <td data-lang="${logo.category}">${categoria}</td>
                <td>
                    <span class="contract-status ${statusClass}">${status}</span><br>
                    <small>${dataContrato}</small>
                </td>
                <td>${logo.contractValue || '0,00'}</td>
                <td class="actions">
                    <button data-id="${logo.clientCNPJ}" class="edit-btn">Editar</button>
                    <button data-id="${logo.clientCNPJ}" class="delete-btn">Excluir</button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        // Inicializa totalContractValue como 0
        let totalContractValue = 0;

        // Itera pela lista para somar os valores dos contratos
        list.forEach(logo => {
            const contractValue = !logo.contractValue || !contratoAtivo(logo) ? 0 : parseFloat(logo.contractValue.replace(/[^\d,-]/g, '').replace(',', '.'));            
            if (!isNaN(contractValue)) {
                totalContractValue += contractValue;
            }
        });
        
        // Adiciona uma linha com o total geral da coluna "Valor Contrato"
        const totalRow = document.createElement('tr');
        totalRow.innerHTML = `
            <td colspan="8" class="lbl-valor-contrato">Total Geral:</td>
            <td id="table-valor-contrato">${totalContractValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
        
        table.appendChild(tbody);
        logosGrid.appendChild(table);
    }

    // Funções auxiliares (mantidas iguais)
    function getCategoryLabelByValue(value) {
        for (const category of categories) {
            // Verifica se é o valor do grupo principal
            if (category.value === value) {
                return category.label;
            }
    
            // Procura nas subcategorias (options)
            const subcategory = category.options.find(option => option.value === value);
            if (subcategory) {
                return subcategory.label;
            }
        }
    
        return null; // Não encontrado
    }
   
    function contratoAtivo(logo) {
        const endDate = new Date(logo.endDate);
        const today = new Date();
    
            // Zera o horário de hoje para comparação apenas por data (opcional)
            today.setHours(0, 0, 0, 0);
            endDate.setHours(0, 0, 0, 0);
    
        if (endDate < today) return false;
    
        if (!logo.contractActive) return false; 
        
    
        return true
    }

    // Carrega os dados de um logo no formulário para edição    
      function loadLogoForEdit(cnpj) {
        const logo = logos.find(l => l.clientCNPJ === cnpj);
        if (!logo) return;
    
        editingIndex = logos.findIndex(l => l.clientCNPJ === cnpj);
    
        document.getElementById("client-name").value = logo.clientName;
        document.getElementById("client-fantasy-name").value = logo.clientFantasyName || '';
        document.getElementById("client-cnpj").value = logo.clientCNPJ || '';
        document.getElementById("client-city").value = logo.clientCity || '';
        document.getElementById("client-uf").value = logo.clientUf || '';
        document.getElementById("telephone").value = logo.telephone || '';
        document.getElementById("cellphone").value = logo.cellphone || '';
        document.getElementById("client-website").value = logo.websiteUrl || '';
        document.getElementById("client-videoUrl").value = logo.videoUrl || '';
        document.getElementById("client-instagramUrl").value = logo.instagramUrl || '';
        document.getElementById("client-facebookUrl").value = logo.facebookUrl || '';
        document.getElementById("client-whatsapp").value = logo?.clientWhatsapp || '';
        document.getElementById("logo-description").value = logo.description || '';
        document.getElementById("logo-category").value = logo.category || '';
        document.getElementById("start-date").value = logo.startDate || '';
        document.getElementById("contract-months").value = logo.contractMonths || '';
        document.getElementById("end-date").value = logo.endDate || ''; 
        document.getElementById("email").value = logo.email || '';
        document.getElementById("plan_type").value = logo.planType || '';
        document.getElementById("client_level").value = logo.clientLevel || "0";        
        document.getElementById("contract_value").value = logo.contractValue || "0,00";
    
        // Define o radio button correto
        document.getElementById("ativo-true").checked = !!logo.contractActive;
        document.getElementById("ativo-false").checked = !logo.contractActive;
    
        // Mostra a imagem atual
        const imagePreview = document.createElement('div');
        imagePreview.innerHTML = `
            <p>Imagem Atual:</p>
            <img src="${logo.imagem}" alt="Logo atual" style="max-width: 100px; margin: 10px 0;" />
            <p>Se desejar alterar, selecione uma nova imagem abaixo:</p>
        `;
    
        const imageInputContainer = document.getElementById("logo-image").parentNode;
        const oldPreview = document.getElementById("current-image-preview");
        if (oldPreview) oldPreview.remove();
    
        imagePreview.id = "current-image-preview";
        imageInputContainer.insertBefore(imagePreview, document.getElementById("logo-image"));
    
        document.getElementById("logo-image").required = false;
        
        saveBtn.textContent = 'Atualizar';
        document.querySelector('.logo-form-container').classList.add('editing-mode');
    }

        // Filtra e atualiza a lista exibida
     function applyFilters() {
            const searchTerm = searchInput.value.toLowerCase();
            const selectElement = filterCategory
    
            let category = "";
            if (!!selectElement.value) {
                category = selectElement.value;
            }
            
            const filtered = logos.filter(logo => {
                const matchesName = logo.clientName.toLowerCase().includes(searchTerm);
                const matchesFantasyName = logo.clientFantasyName.toLowerCase().includes(searchTerm);
                const matchesCNPJ = logo.clientCNPJ.toLowerCase().includes(searchTerm);
                const matchesCity = logo.clientCity.toLowerCase().includes(searchTerm);
                const matchesUF = logo.clientUf.toLowerCase().includes(searchTerm);
                const matchesPlanType =  (logo.planType || "").toLowerCase().includes(searchTerm);
                const matchesCategory = category === "" || logo.category === category;
                return (matchesPlanType || matchesName || matchesFantasyName || matchesCNPJ || matchesCity || matchesUF) && matchesCategory;
            });
    
            renderLogos(filtered);
    }
    
    function populateCategories() {
        categories.forEach(group => {
            const optgroup = document.createElement("optgroup");
            optgroup.label = group.label;
            group.options.forEach(option => {
                const optionElement = document.createElement("option");
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                optgroup.appendChild(optionElement);
            });
            logoCategorySelect.appendChild(optgroup);
        });
    }

        // Preenche as categorias no filtro também
        function populateFilterCategories() {
            categories.forEach(group => {
                const optgroup = document.createElement("optgroup");
                optgroup.label = group.label;
                group.options.forEach(option => {
                    const optionElement = document.createElement("option");
                    optionElement.value = option.value;
                    optionElement.textContent = option.label;
                    optgroup.appendChild(optionElement);
                });
                filterCategory.appendChild(optgroup);
            });
        }
    
        function validarCNPJ(cnpj) {
            cnpj = cnpj.replace(/[^\d]+/g, '');
          
            if (cnpj.length !== 14) return false;
            if (/^(\d)\1+$/.test(cnpj)) return false;
          
            let tamanho = cnpj.length - 2;
            let numeros = cnpj.substring(0, tamanho);
            let digitos = cnpj.substring(tamanho);
            let soma = 0;
            let pos = tamanho - 7;
          
            for (let i = tamanho; i >= 1; i--) {
              soma += numeros.charAt(tamanho - i) * pos--;
              if (pos < 2) pos = 9;
            }
          
            let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
            if (resultado != digitos.charAt(0)) return false;
          
            tamanho += 1;
            numeros = cnpj.substring(0, tamanho);
            soma = 0;
            pos = tamanho - 7;
          
            for (let i = tamanho; i >= 1; i--) {
              soma += numeros.charAt(tamanho - i) * pos--;
              if (pos < 2) pos = 9;
            }
          
            resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
            if (resultado != digitos.charAt(1)) return false;
          
            return true;
        }
          
        function validarCNPJNoCampo() {
            const input = document.getElementById('client-cnpj');
            const feedback = document.getElementById('cnpj-feedback');
            const cnpj = input.value;
          
            if (cnpj === '') {
              feedback.textContent = '';
              input.style.borderColor = '';
              return;
            }
          
            if (validarCNPJ(cnpj)) {
              feedback.textContent = '';
              input.style.borderColor = 'green';
            } else {
              feedback.textContent = 'CNPJ inválido';
              input.style.borderColor = 'red';
            }
        }
    
        // Função para calcular data final baseada na data inicial e meses
        function calculateEndDate() {
            if (!startDateInput.value || !contractMonthsSelect.value) return;
            
            const startDate = new Date(startDateInput.value);
            const monthsToAdd = parseInt(contractMonthsSelect.value);
            
            let endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + monthsToAdd);
            
            // Ajuste para o último dia do mês se o dia original não existir no novo mês
            if (startDate.getDate() !== endDate.getDate()) {
                endDate.setDate(0);
            }
            
            const year = endDate.getFullYear();
            const month = String(endDate.getMonth() + 1).padStart(2, '0');
            const day = String(endDate.getDate()).padStart(2, '0');
            
            endDateInput.value = `${year}-${month}-${day}`;
        }
            
    // Evento de submit do formulário adaptado para Firebase
    logoForm.addEventListener("submit", async (e) => {
        e.preventDefault();
    
        const formData = {
            clientCNPJ: document.getElementById("client-cnpj").value,
            clientName: document.getElementById("client-name").value,
            clientFantasyName: document.getElementById("client-fantasy-name").value,
            cellphone: document.getElementById("cellphone").value,
            telephone: document.getElementById("telephone").value,
            clientCity: document.getElementById("client-city").value,
            clientUf: document.getElementById("client-uf").value,
            email: document.getElementById("email").value,
            websiteUrl: document.getElementById("client-website").value,
            videoUrl: document.getElementById("client-videoUrl").value,
            instagramUrl: document.getElementById("client-instagramUrl").value,
            facebookUrl: document.getElementById("client-facebookUrl").value,
            clientWhatsapp: document.getElementById("client-whatsapp").value,
            description: document.getElementById("logo-description").value,
            category: logoCategorySelect.value,
            startDate: startDateInput.value,
            contractMonths: contractMonthsSelect.value,
            endDate: endDateInput.value,
            contractActive: document.querySelector('input[name="contract-active"]:checked').value === 'true',
            planType: document.getElementById('plan_type').value,
            clientLevel: document.getElementById('client_level').value,
            contractValue: document.getElementById("contract_value").value,
            userId: userId
        };
    
        const file = document.getElementById("logo-image").files[0];
    
        try {
            if (editingIndex !== null) {
                // Modo edição
                const logoId = logos[editingIndex].id;
                let imageUrl = logos[editingIndex].imagem;
                let deleteToken = logos[editingIndex].deleteToken;
    
                if (file) {
                    const { imageUrl: newUrl, deleteToken: newToken } = await uploadImageToCloudinary(file);
                    imageUrl = newUrl;
                    deleteToken = newToken;
                    formData.imagem = imageUrl;
                    formData.deleteToken = deleteToken;
                }
    
                await updateLogoInFirestore(logoId, formData);
                logos[editingIndex] = { ...logos[editingIndex], ...formData };
    
            } else {
                // Novo cadastro
                if (!file) {
                    showAlert("Selecione uma imagem!");
                    return;
                }
    
                const cnpjExists = logos.some(l => l.clientCNPJ === formData.clientCNPJ);
                if (cnpjExists) {
                    showAlert("CNPJ já cadastrado!");
                    return;
                }
    
                const logoId = await addLogoToFirestore(formData);
                const { imageUrl, deleteToken } = await uploadImageToCloudinary(file);
                await updateLogoInFirestore(logoId, { imagem: imageUrl, deleteToken });
    
                logos.push({
                    id: logoId,
                    ...formData,
                    imagem: imageUrl,
                    deleteToken,
                    createdAt: new Date()
                });
            }
    
            renderLogos(logos);
            logoForm.reset();
    
            editingIndex = null;
            saveBtn.textContent = 'Salvar';
            document.querySelector('.logo-form-container').classList.remove('editing-mode');
    
            const oldPreview = document.getElementById("current-image-preview");
            if (oldPreview) oldPreview.remove();
    
            showAlert("Cadastro realizado com sucesso!","Sucesso","success")
        } catch (error) {
            console.error("Erro ao salvar logo:", error);
            showAlert("Ocorreu um erro ao salvar. Por favor, tente novamente.");
        }
    });
    
    let cnpjDelete = null;
    document.getElementById("confirm-delete").addEventListener("click", async () => {
        if (cnpjDelete !== null) {
            try {
                const logoToDelete = logos.find(l => l.clientCNPJ === cnpjDelete);
                if (logoToDelete) {
                    // Exclui a imagem do Cloudinary
                    await deleteLogoFromCloudinary(logoToDelete.deleteToken);
    
                    // Exclui o logo do Firestore
                    await deleteLogoFromFirestore(logoToDelete.id);
    
                    // Remove o logo da lista local
                    logos = logos.filter(l => l.clientCNPJ !== cnpjDelete);
                    
                    // Renderiza novamente a lista de logos
                    renderLogos(logos);

                    showAlert("Excluído com sucesso", "Atenção!", "success");
                }
            } catch (error) {
                console.error("Erro ao excluir logo:", error);
               showAlert("Ocorreu um erro ao excluir. Por favor, tente novamente.","Erro","error");
            }
            cnpjDelete = null;
            document.getElementById("delete-modal").classList.add("hidden");
        }
    });

    // Outros event listeners
    logosGrid.addEventListener("click", (e) => {
        if (e.target.classList.contains("delete-btn")) {
            cnpjDelete = e.target.dataset.id;
            document.getElementById("delete-modal").classList.remove("hidden");
        }

        if (e.target.classList.contains("edit-btn")) {
            const cnpjEditar = e.target.dataset.id;
            loadLogoForEdit(cnpjEditar);
            document.querySelector('.logo-form-container').scrollIntoView({ behavior: 'smooth' });
        }
    });

    document.getElementById("cancel-delete").addEventListener("click", () => {
        cnpjDelete = null;
        document.getElementById("delete-modal").classList.add("hidden");
    });
    
    cancelBtn.addEventListener('click', () => {
        editingIndex = null;
        saveBtn.textContent = 'Salvar';

        const oldPreview = document.getElementById("current-image-preview");
        if (oldPreview) oldPreview.remove();
    });

    searchInput.addEventListener("input", applyFilters);
    filterCategory.addEventListener("change", applyFilters);
    startDateInput.addEventListener('change', calculateEndDate);
    contractMonthsSelect.addEventListener('change', calculateEndDate);

    // Inicializa a aplicação
    init();
});

document.getElementById("btn-upload-image").addEventListener("click", () => {
    document.getElementById("logo-image").click();
});

document.getElementById("logo-image").addEventListener("change", (event) => {    
    const file = event.target.files[0];
    if (file) {
        document.getElementById("logo-image-url").value = file.name;
    }
});

// Funções de máscara e validação (mantidas iguais)
const cnpjInput = document.getElementById('client-cnpj');
cnpjInput.addEventListener('input', function () {
    let value = cnpjInput.value.replace(/\D/g, ''); // Remove tudo que não é dígito

    if (value.length > 14) value = value.slice(0, 14); // Limita a 14 dígitos

    // Aplica a máscara: 00.000.000/0000-00
    value = value.replace(/^(\d{2})(\d)/, '$1.$2');
    value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
    value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
    value = value.replace(/(\d{4})(\d)/, '$1-$2');

    cnpjInput.value = value;
});

function aplicarMascaraTelefone(input, isCelular = false) {
    input.addEventListener('input', function (e) {
        let valor = input.value.replace(/\D/g, '');
        if (isCelular) {
            // Celular: (00) 00000-0000
            valor = valor.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
        } else {
            // Telefone fixo: (00) 0000-0000
            valor = valor.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
        }
        input.value = valor;
    });
}

/*Anexar imagem*/
document.getElementById("logo-image").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const result = await uploadImageToCloudinary(file);
      document.getElementById("logo-image-url").value = result.imageUrl;
    } catch (error) {
      alert("Erro ao enviar imagem: " + error.message);
    }
});
  
document.addEventListener('DOMContentLoaded', function () {
    const telefoneInput = document.getElementById('telephone');
    const celularInput = document.getElementById('cellphone');
    aplicarMascaraTelefone(telefoneInput);
    aplicarMascaraTelefone(celularInput, true);
});

// Validação de valor do contrato (mantida igual)
const inputValorContrato = document.getElementById('contract_value');
function formatToMoney(value) {
    value = value.replace(/\D/g, '');
    if (value === '') return '0,00';
    value = (parseInt(value, 10) / 100).toFixed(2);
    return value
      .replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  inputValorContrato.addEventListener('input', function (e) {
    e.target.value = formatToMoney(e.target.value);
  });

  inputValorContrato.addEventListener('focus', function () {
    if (inputValorContrato.value === '0,00') {
        inputValorContrato.value = '';
    }
  });

  inputValorContrato.addEventListener('blur', function () {
    if (inputValorContrato.value === '') {
        inputValorContrato.value = '0,00';
    }
  });

// Validação de email 
const emailInput = document.getElementById('email');
const emailError = document.getElementById('email-error');

function isValidEmail(email) {
  // Expressão regular simples para validação de e-mail
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

emailInput.addEventListener('input', function () {
  if (emailInput.value === '' || isValidEmail(emailInput.value)) {
    emailError.style.display = 'none';
    emailInput.setCustomValidity('');
  } else {
    emailError.style.display = 'block';
    emailInput.setCustomValidity('E-mail inválido');
  }
});