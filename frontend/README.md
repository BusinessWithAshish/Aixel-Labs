# Frontend - Aixel Labs

A comprehensive Next.js 15 web application for lead management, communication, and voice agent functionality.

## 🎯 Overview

This is the frontend application for the Aixel Labs platform - an agentic lead management system that provides tools for lead generation, messaging (SMS & WhatsApp), and voice agent capabilities. The application is built with Next.js 15, React 19, TypeScript, and TailwindCSS v4.

## 📊 Current Development Stage

**Status**: Early Development / Active Build Phase

The application is currently in active development with the following module completion status:

- ✅ **Lead Generation System (LGS)**: Fully functional - Google Maps scraping with location-based and direct ID/URL search
- 🔨 **Messaging Module**: Functional - SMS and WhatsApp messaging with Twilio integration
- 🔨 **Voice Agent**: Basic implementation - Web dialer functional, advanced features pending
- 📋 **Email Module**: Planned - Not yet implemented
- 📋 **Client Management**: Planned - UI navigation exists but pages not implemented

## 🛠️ Tech Stack

### Core Framework
- **Next.js 15.3.1** - React framework with App Router
- **React 19.0.0** - UI library
- **TypeScript 5** - Type safety
- **TailwindCSS v4** - Styling with `@tailwindcss/postcss`

### UI Components
- **Radix UI** - Headless UI primitives (Dialog, Dropdown, Popover, Select, etc.)
- **shadcn/ui** - Beautiful component library built on Radix UI
- **Lucide React** - Icon library
- **Poppins Font** - Google Fonts integration

### Communication & APIs
- **Twilio Voice SDK** - Voice calling capabilities
- **Twilio Functions** - Serverless backend for messaging
- **Axios** - HTTP client for API requests
- **AWS SDK** - AWS service integration

### Utilities
- **Zod** - Schema validation
- **country-state-city** - Location data
- **class-variance-authority** - Component variants
- **clsx & tailwind-merge** - Conditional styling

## 📁 Project Structure

```
frontend/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx               # Root layout with Poppins font
│   ├── page.tsx                 # Home page with dashboard link
│   ├── globals.css              # Global styles and Tailwind imports
│   │
│   ├── lead-generation/         # Lead Generation Module
│   │   ├── page.tsx            # Main lead gen page
│   │   ├── README.md           # Detailed LGS documentation
│   │   └── LGS/                # Lead Generation System
│   │       ├── page.tsx        # LGS page with provider
│   │       ├── _components/    # UI components (9 files)
│   │       │   ├── ConfigurationForm.tsx
│   │       │   ├── LocationForm.tsx
│   │       │   ├── IdUrlForm.tsx
│   │       │   ├── ResultsSection.tsx
│   │       │   ├── LeadCard.tsx
│   │       │   ├── CityCheckbox.tsx
│   │       │   ├── GenerateLeads.tsx
│   │       │   ├── LeadGenerationProvider.tsx
│   │       │   └── index.ts
│   │       ├── _contexts/       # React Context providers (4 files)
│   │       │   ├── ConfigurationContext.tsx
│   │       │   ├── FormContext.tsx
│   │       │   ├── SubmissionContext.tsx
│   │       │   └── index.ts
│   │       └── _utlis/          # Type definitions
│   │           └── types.ts
│   │
│   ├── messaging/               # Messaging Module
│   │   ├── page.tsx            # Main messaging page (placeholder)
│   │   ├── constants.ts        # Twilio Functions URL
│   │   ├── types.ts            # TypeScript types for messages
│   │   ├── sms/                # SMS functionality
│   │   │   └── page.tsx        # SMS send/receive interface
│   │   └── whatsapp/           # WhatsApp functionality
│   │       └── page.tsx        # WhatsApp chat interface
│   │
│   └── voice-agent/             # Voice Agent Module
│       ├── page.tsx            # Main voice agent page (placeholder)
│       └── web-dialer/         # Web-based dialer
│           └── page.tsx        # Twilio Voice SDK integration
│
├── components/                  # Reusable components
│   ├── common/                 # Common components
│   │   └── PageLayout.tsx      # Standard page layout with sidebar
│   │
│   ├── layout/                 # Layout components
│   │   ├── app-sidebar.tsx    # Main application sidebar
│   │   ├── nav-main.tsx       # Main navigation component
│   │   ├── nav-projects.tsx   # Projects navigation
│   │   ├── nav-user.tsx       # User menu component
│   │   └── team-switcher.tsx  # Team/workspace switcher
│   │
│   ├── ui/                     # shadcn/ui components (28 files)
│   │   ├── alert.tsx
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── sidebar.tsx
│   │   └── ... (and more)
│   │
│   └── wrappers/               # Component wrappers
│       └── InputWithLabel.tsx  # Input + Label wrapper
│
├── helpers/                     # Helper functions
│   └── get-be-url.ts           # Backend URL builder utility
│
├── hooks/                       # Custom React hooks
│   ├── use-mobile.ts           # Mobile detection hook
│   └── use-sidebar.ts          # Sidebar configuration hook
│
├── lib/                         # Library code
│   └── utils.ts                # Utility functions (cn function)
│
├── types/                       # TypeScript type definitions
│   └── api.ts                  # API response types
│
├── public/                      # Static assets
│   ├── next.svg
│   ├── vercel.svg
│   └── ...
│
├── package.json                 # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── next.config.ts              # Next.js configuration
├── components.json             # shadcn/ui configuration
├── postcss.config.mjs          # PostCSS configuration
├── prettier.config.cjs         # Prettier configuration
└── eslint.config.mjs           # ESLint configuration
```

## 🎨 Key Features

### 1. Lead Generation System (LGS)
**Status**: ✅ Fully Functional

A comprehensive system for scraping business leads from Google Maps.

**Features**:
- **Dual Search Modes**:
  - Location-based search (query + country + state + cities)
  - Direct ID/URL input for specific places
- **Flexible Backend Configuration**:
  - AWS EC2 management with automatic instance handling
  - Direct backend URL connection
  - Password-protected credential inputs
- **Real-time Results**: Live feedback and lead display
- **Context-based State Management**: Using React Context API for clean separation

**Architecture**:
- 3 separate contexts: Configuration, Form, Submission
- 6 specialized components for different UI sections
- Full TypeScript support with proper type definitions

See detailed documentation: `app/lead-generation/README.md`

### 2. Messaging Module
**Status**: 🔨 Functional

SMS and WhatsApp messaging powered by Twilio.

**SMS Features**:
- Send SMS to any phone number (E.164 format)
- View sent/received message logs
- Real-time message updates
- Message direction badges (inbound/outbound)

**WhatsApp Features**:
- Full chat interface with multiple customer conversations
- Support for chat states: NEW, ACTIVE, EXPIRED
- Template message support for new/expired conversations
- Real-time message synchronization
- Message history with timestamps
- Approved template management
- Create new chats with customers

**Integration**:
- Twilio Functions serverless backend
- Endpoints: `/send-sms`, `/list-sms`, `/send-whatsapp`, `/list-whatsapp`, `/msg-templates`

### 3. Voice Agent Module
**Status**: 🔨 Basic Implementation

Web-based voice calling using Twilio Voice SDK.

**Current Features**:
- Web dialer interface
- Outbound call capabilities
- Device registration and token management
- Automatic token refresh
- Call status tracking
- Incoming call handling

**Pending Features**:
- Inquiry/Bookings system
- Custom Agent Analytics
- Call recording
- Call history

### 4. UI Component Library
**Status**: ✅ Complete

28 production-ready components from shadcn/ui including:
- Form controls: Button, Input, Select, Checkbox, Switch
- Layout: Card, Dialog, Sheet, Tabs, Collapsible
- Feedback: Alert, Badge, Progress, Skeleton, Tooltip
- Navigation: Breadcrumb, Dropdown Menu, Sidebar
- Data display: Avatar, Scroll Area, Separator

All components are:
- Built on Radix UI primitives
- Fully accessible (ARIA compliant)
- Customizable with Tailwind CSS
- TypeScript typed

### 5. Application Layout
**Status**: ✅ Complete

- **PageLayout Component**: Reusable layout with sidebar integration
- **App Sidebar**: Collapsible sidebar with navigation
- **Navigation System**:
  - Lead Generation (6 sub-items)
  - Voice Agent (3 sub-items)
  - Messaging (3 sub-items)
  - Email Module (5 sub-items - pending)
  - Client Management (2 sub-items - pending)
- **Team Switcher**: Multi-tenant workspace support
- **User Menu**: User profile and settings

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- pnpm (package manager)

### Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev
```

The application runs on **port 3003** by default.

### Available Scripts

```bash
pnpm dev      # Start development server on port 3003
pnpm build    # Build for production
pnpm start    # Start production server
pnpm lint     # Run ESLint
pnpm prod     # Clean build and start production server
```

## 🔧 Configuration

### Environment Variables
Currently, the application uses hardcoded URLs and manual credential input. Future work will move to environment variables:
- Twilio Functions URL
- Backend API URL
- AWS credentials (currently manual input)

### Build Configuration
- **ESLint**: Errors ignored during builds (development phase)
- **TypeScript**: Type errors ignored during builds (development phase)
- **Font**: Poppins with weights 400, 500, 600, 700

## 🗺️ Routing

The application uses Next.js App Router:

- `/` - Home page with dashboard link
- `/lead-generation` - Lead generation landing page
- `/lead-generation/LGS` - Google Maps scraper (fully functional)
- `/messaging` - Messaging landing page
- `/messaging/sms` - SMS interface (functional)
- `/messaging/whatsapp` - WhatsApp chat interface (functional)
- `/voice-agent` - Voice agent landing page
- `/voice-agent/web-dialer` - Web dialer (functional)

## 📦 Dependencies Overview

### Production Dependencies (45 packages)
- **UI**: 15 Radix UI components, lucide-react icons
- **Communication**: Twilio Voice SDK, twilio client, aws-sdk
- **Data**: country-state-city, zod validation
- **HTTP**: axios
- **Styling**: TailwindCSS utilities, CVA

### Development Dependencies (10 packages)
- TypeScript, ESLint, Prettier
- TailwindCSS v4, PostCSS
- Next.js types for React 19

## 🔗 Integration Points

### Backend Integration
- Lead scraping endpoint: Backend API at configurable URL
- Format: `POST /gmaps/scrape` with JSON payload

### Twilio Integration
- Functions URL: `https://api-aixellabs-5684.twil.io`
- SMS: `/send-sms`, `/list-sms`
- WhatsApp: `/send-whatsapp`, `/list-whatsapp`, `/msg-templates`
- Voice: `/token` for device registration

### AWS Integration
- EC2 instance management (optional)
- Requires: Access Key ID, Secret Access Key, Region, Instance ID

## 🎯 Future Development

### Planned Features
1. **Email Module**: Cold/warm outreach, templates, AI replies
2. **Client Management**: Module enablement, multi-tenant accounts
3. **Analytics**: Comprehensive analytics for all modules
4. **LinkedIn Scraper**: Lead generation from LinkedIn
5. **Social Media Scrapers**: Instagram, Facebook lead generation
6. **Advanced Voice Features**: Inquiry/bookings system, custom analytics

### Technical Improvements
1. Environment variable configuration
2. Error boundary implementation
3. Loading states and skeletons
4. Comprehensive test coverage
5. Enable TypeScript strict mode
6. Enable ESLint during builds
7. API response error handling
8. Authentication and authorization
9. Multi-tenancy full implementation

## 📝 Code Quality

### Current State
- **TypeScript**: Configured but build errors ignored (development phase)
- **ESLint**: Configured but errors ignored during builds
- **Prettier**: Configured for code formatting
- **Type Safety**: Partial - most components typed, some `any` usage

### Standards
- **Component Structure**: Functional components with hooks
- **State Management**: React Context API for complex state, useState for local state
- **Styling**: Tailwind CSS with `cn()` utility for conditional classes
- **File Naming**: kebab-case for files, PascalCase for components

## 🤝 Workspace Integration

This frontend is part of a monorepo workspace with:
- `@aixellabs/shared` - Shared utilities and types
- `@aixellabs/frontend` - This application
- `backend/` - Node.js backend API

## 📄 License & Contact

- **Organization**: Aixel Labs
- **Email**: hello@aixellabs.in
- **Version**: 0.1.0
- **License**: Private

---

**Last Updated**: November 2025
**Documentation Version**: 1.0.0
