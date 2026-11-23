<div align="center" id="inicio">

# ![Logo da Workly](frontend/assets/img2/logo.png)
### Plataforma digital que conecta freelancers e contratantes de forma segura e eficiente.

***

### Centro Paula Souza
### Faculdade de Tecnologia de Jahu
### Curso de Tecnologia em Desenvolvimento de Software Multiplataforma

### Documento da aplicação web

### **Workly**

### Jaú, SP

### 1º Semestre/2026

***
</div>

<br>

<details open>
<summary><span style="font-size:4em"><strong>Sumário</strong></span></summary>
<br>

- [](#)
  - [🎯 Introdução](#-introdução)
    - [💡 Motivação](#-motivação)
    - [🎪 Objetivos](#-objetivos)
    - [📅 Cronograma](#-cronograma)
  - [🎭 Protótipo](#-protótipo)
    - [Como rodar](#como-rodar)

</details>

<br>

## 🎯 Introdução
 
### 💡 Motivação
 
O mercado de trabalho brasileiro passa por uma **significativa transformação**, com crescimento notável tanto nas demissões voluntárias quanto no interesse por áreas de tecnologia. Esses movimentos revelam uma busca por novos modelos de trabalho que ofereçam maior autonomia e flexibilidade.
 
A **Workly** nasce da crescente insatisfação das pessoas com as condições tradicionais do mercado de trabalho, oferecendo uma alternativa mais **justa, flexível e alinhada às demandas do futuro**. A plataforma conecta talentos criativos e digitais a oportunidades reais, permitindo que cada profissional atue com autonomia, segurança e valorização do seu portfólio.
 
Ao intermediar de forma transparente e justa a relação entre contratantes e freelancers, a Workly não apenas amplia as possibilidades de carreira, mas também **transforma a frustração** com o modelo convencional em **oportunidades de crescimento, inovação e realização profissional**.

<br>

### 🎪 Objetivos
 
A Workly surge como resposta às transformações do mercado de trabalho contemporâneo, posicionando-se como uma **plataforma integradora** que conecta freelancers qualificados a oportunidades de projetos flexíveis. 
 
Nosso objetivo é desenvolver e consolidar uma plataforma digital inovadora que:
 
✨ Facilite conexões significativas entre profissionais independentes e contratantes da área de tecnologia  
🔒 Ofereça segurança, eficiência e ferramentas adequadas para ambos os lados  
📈 Amplie as possibilidades de carreira e crescimento profissional  
🌍 Transforme o mercado de trabalho em algo mais justo e flexível  

<br>

### 📅 Cronograma
 
📌 O cronograma completo do projeto está disponível em: **[Trello do Projeto](https://trello.com/b/WpYWgrs3/pi-site-de-freelancer)**
 
<br>

## 🎭 Protótipo
 
O protótipo da Workly foi desenvolvido utilizando a ferramenta **Figma**, que permite a criação de interfaces interativas e visualmente atraentes.

> 🔗 **[Acesse o Protótipo no Figma](https://www.figma.com/design/hYmRgDqf9kCFHGjJNyExRh/Prot%C3%B3tipo-P.I?node-id=0-1&t=5eQE3HyoxGAMwKo0-0)**

<br>

### Como rodar

É necessário ter **Node.js 24, npm e MongoDB** instalados, com o MongoDB em execução. A versão atual usa React no frontend e Express com MongoDB no backend.

**1. Backend**

Na pasta `backend`, copie `.env.example` para `.env`. Configure `MONGO_URI` e preencha `JWT_SECRET` com uma chave longa e aleatória. Mantenha `AUTO_SEED=false` para iniciar sem dados de demonstração. Depois, na raiz do repositório, execute:

```bash
cd backend
npm ci
npm run prepare:assets
npm run dev
```

A API ficará disponível em `http://localhost:3000`. Não sobrescreva um `.env` já configurado.

**2. Frontend**

Na pasta `frontend`, copie `.env.example` para `.env.local`. Em outro terminal, a partir da raiz do repositório, execute:

```bash
cd frontend
npm ci
npm run dev
```

Abra **http://localhost:5173** no navegador. Mantenha os dois terminais abertos enquanto usar a aplicação.

**Verificações:** execute `npm test` em cada pasta. No frontend, `npm run build` gera a versão de produção. Fotos enviadas e arquivos `.env` são locais e não acompanham o repositório.
