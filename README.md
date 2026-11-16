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
    - [🎭 Protótipo](#-prototipo)
  - [💻 Aplicação](#-aplicação)
    - [Como rodar](#como-rodar)
  - [🏁 Considerações Finais](#-considerações-finais)
    - [1º Semestre](#1º-semestre)
    - [2º Semestre](#2º-semestre)
    - [3º Semestre](#3º-semestre)

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

## 🎭 Protótipo
 
O protótipo da Workly foi desenvolvido utilizando a ferramenta **Figma**, que permite a criação de interfaces interativas e visualmente atraentes.

> 🔗 **[Acesse o Protótipo no Figma](https://www.figma.com/design/hYmRgDqf9kCFHGjJNyExRh/Prot%C3%B3tipo-P.I?node-id=0-1&t=5eQE3HyoxGAMwKo0-0)**

<br>

## 💻 Aplicação
 
A aplicação foi desenvolvida inicialmente como uma **página estática**, incorporando exemplos de funcionalidades futuras e algumas já operacionais.
 
📁 **Arquivos e documentação** estão armazenados neste GitHub.

[![Pagina inicial](frontend/assets/img2/paginainicial.png)](https://www.figma.com/design/hYmRgDqf9kCFHGjJNyExRh/Prot%C3%B3tipo-P.I?node-id=3-13&t=OfXh8xe9dPCxdqg8-4)
**Clique na imagem para ampliar** 🔍

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

<br>

## 🏁 Considerações Finais

### 1º Semestre
Este documento detalhou o processo de desenvolvimento da aplicação Workly. Durante o percurso, enfrentamos desafios, como a perda de um membro da equipe responsável pela documentação. No entanto, com a dedicação da equipe remanescente, conseguimos iniciar e avançar em diversas frentes, que serão concluídas no próximo semestre. Acreditamos que a Workly trará contribuições significativas para o mercado de trabalho, conectando freelancers e contratantes de forma eficiente e segura.

### 2º Semestre

Atualizamos toda a documentação, continuamos aprimorando a plataforma, implementando as funcionalidades planejadas tivemos dificuldade em concluir com o desenvolvimento da aplicação para seguir os requisitos desse semestre, mas conseguimos avançar em diversos aspectos do projeto, como o design, protótipo e documentação.

### 3º Semestre

**N/A**

<p align="right"><a href="#inicio">[⬆️️ Voltar ao início]</a></p>
