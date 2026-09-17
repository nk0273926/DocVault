# 🔐 DocVault

### Secure Document Storage & Management System

DocVault is a web-based document management platform designed to help users securely store, organize, manage, and access their important documents.

It provides document storage, case management, role-based access control, team collaboration, and activity tracking through a centralized dashboard.

## ✨ Features

### 📁 Document Management

* Upload and store documents.
* Organize documents by cases and categories.
* Manage document versions.
* Download and access stored documents.
* Control document access through permissions.

### 📂 Case Management

* Create, view, and manage cases.
* Track case status and priority.
* View detailed case information.
* Organize cases through a centralized dashboard.

### 🔑 Authentication & Access Control

* User authentication with Supabase.
* Role-based access control (RBAC).
* Admin and user access restrictions.
* Document-level permissions.
* Multi-factor authentication (MFA) demo flow.

### 👥 Team Management

* Manage team members.
* Assign users to cases.
* Control access to case information.

### 🛡️ Security & Audit

* PostgreSQL Row Level Security (RLS).
* Private Supabase Storage bucket.
* Storage access policies.
* Activity and audit history.
* Admin approval workflow for deletion requests.

## 🛠️ Tech Stack

| Technology   | Purpose                                   |
| ------------ | ----------------------------------------- |
| React        | Frontend UI                               |
| TypeScript   | Type safety                               |
| Vite         | Development and build tool                |
| Tailwind CSS | Styling                                   |
| Supabase     | Authentication, database and file storage |
| Lucide React | Icons                                     |

## 📂 Project Structure

```text
DocVault/
├── src/
│   ├── components/
│   ├── context/
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   ├── app.tsx
│   └── main.tsx
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── .env.example
├── .gitignore
├── package.json
├── index.html
└── README.md
```

## ⚙️ Getting Started

### Prerequisites

* Node.js (LTS version recommended)
* npm
* Git
* A Supabase account

### 1. Clone the repository

```bash
git clone https://github.com/nk0273926/DocVault.git
cd DocVault
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Replace the placeholder values with your Supabase project credentials.

**Never commit your `.env` file, API secrets, or Supabase service-role keys to GitHub.**

### 4. Configure Supabase

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run the SQL migration files from `supabase/migrations/` in chronological order.
4. Configure authentication settings.
5. Set up the required database tables and storage bucket.
6. Configure Row Level Security and storage access policies.

Refer to `supabase/seed.sql` for the project's demo data setup instructions.

### 5. Start the development server

```bash
npm run dev
```

Open the local URL displayed in your terminal to access DocVault.

## 🧪 Available Scripts

| Command             | Description                  |
| ------------------- | ---------------------------- |
| `npm run dev`       | Start development server     |
| `npm run build`     | Build production application |
| `npm run preview`   | Preview production build     |
| `npm run lint`      | Run ESLint                   |
| `npm run typecheck` | Check TypeScript types       |

## 🔒 Security Notes

DocVault uses Supabase authentication, database access policies, and private file storage to help protect documents.

* Access to documents and cases is controlled through permissions.
* Database access is protected using RLS policies.
* Administrative operations are restricted to authorized users.
* The MFA flow currently serves as a demo and requires production-ready verification.

Review and test all authentication, database, and storage policies before using real confidential documents.

## 🚧 Project Status

DocVault is under development. The project includes document storage, case management, authentication, permissions, and audit functionality.

Some security and authentication features require further testing and production configuration.

## 👨‍💻 Author

**Nikhil Kumar**

GitHub: [@nk0273926](https://github.com/nk0273926)

---

<p align="center">
  Built with React, TypeScript and Supabase.
</p>
