# Lead Generation System

A comprehensive lead generation system for extracting business information from Google Maps using React Context API for state management.

## Features

- **Google Maps Scraping**: Extract business leads from Google Maps
- **Flexible Configuration**: Support for both AWS EC2 and direct backend connections
- **Dual Form Types**: Location-based search or direct ID/URL input
- **Real-time Results**: Live feedback and result display
- **Context-based State**: Clean state management using React Context API

## Architecture

### Context Providers
- **ConfigurationContext**: Manages connection settings and validation
- **FormContext**: Handles form data and validation logic
- **SubmissionContext**: Manages API requests and results

### Components
- **LeadGenerationProvider**: Main provider wrapper for all contexts
- **ConfigurationForm**: Connection setup with password inputs and validation
- **LocationForm**: Location-based search form
- **IdUrlForm**: Direct ID/URL input form
- **ResultsSection**: Displays API results and status
- **GenerateLeads**: Main orchestrator component

## Configuration Setup

### Step 1: Choose Connection Type

#### AWS EC2 Management (Toggle ON)
- **Automatic EC2 Management**: Manages EC2 instances automatically
- **Manual Credentials**: Enter AWS credentials directly in the form
- **Required Fields**:
  - AWS Access Key ID (password-protected input)
  - AWS Secret Access Key (password-protected input)
  - AWS Region (e.g., us-east-1)
  - EC2 Instance ID (e.g., i-1234567890abcdef0)
- **Security**: All credentials are entered manually with show/hide toggles

#### Direct Backend Connection (Toggle OFF)
- **Simple URL Input**: Enter your backend server URL directly
- **Flexible**: Works with localhost, AWS, or any backend server
- **Format**: `http://localhost:8100` or `http://your-server:8100`
- **Validation**: Basic URL format validation

### Step 2: Validate Configuration
- Click "Validate Configuration" button
- System checks all required fields
- Green checkmark indicates ready to proceed

## Form Types

### Location-Based Search
- **Query**: Search term (e.g., "restaurants", "dentists")
- **Country**: Select target country from dropdown
- **State/Province**: Select state or province
- **Cities**: Select specific cities within the state
- **Validation**: All fields required for submission

### Direct ID/URL Search
- **IDs/URLs**: Enter Google Maps Place IDs or URLs directly
- **Comma-separated**: Multiple entries supported
- **Format**: `place_id_1, place_id_2, https://maps.google.com/...`
- **Validation**: At least one valid ID/URL required

## Usage Flow

1. **Configure Connection**: 
   - Choose AWS or direct backend connection
   - Fill in required credentials/URL
   - Validate configuration
2. **Select Form Type**: Choose location-based or ID/URL search
3. **Fill Form Data**: Complete the selected form type
4. **Submit**: Click "Start Scraping" when form is valid
5. **View Results**: See extracted leads and business information

## Form Validation

### Configuration Validation
- **AWS Mode**: All AWS credentials must be provided
- **Direct Mode**: Valid URL format required
- **Real-time**: Validation happens on form change

### Form Validation
- **Location Form**: Query + Country + State + Cities required
- **ID/URL Form**: At least one ID/URL required
- **Mutual Exclusion**: Only one form type can be active at a time
- **Submit Button**: Enabled only when form is valid and config is complete

## Security Features

- **Password Inputs**: AWS credentials use password-type inputs
- **Show/Hide Toggle**: Eye icon to reveal/hide sensitive data
- **No Environment Variables**: All credentials entered manually
- **Client-side Validation**: Immediate feedback on input errors

## API Integration

- **Endpoint**: `POST /gmaps/scrape`
- **Request Format**: JSON with form data
- **Response**: JSON with extracted lead information
- **Error Handling**: Clear error messages for failed requests

## Error Handling

- **Configuration Errors**: Clear messages for missing/invalid credentials
- **Form Validation**: Real-time validation with helpful messages
- **API Errors**: Network and server error handling
- **User Feedback**: Loading states and success/error indicators

## Development

### Prerequisites
- Node.js 18+
- Backend server running (for testing)

### Installation
```bash
npm install
npm run dev
```

### Testing
1. Start your backend server
2. Configure connection (direct mode recommended for testing)
3. Fill out a form and submit
4. Check results display

## File Structure

```
app/lead-generation/
├── README.md                    # This file
├── page.tsx                     # Main page with provider
└── LGS/
    ├── _components/             # UI components
    │   ├── LeadGenerationProvider.tsx
    │   ├── GenerateLeads.tsx
    │   ├── ConfigurationForm.tsx
    │   ├── LocationForm.tsx
    │   ├── IdUrlForm.tsx
    │   └── ResultsSection.tsx
    ├── _contexts/               # Context providers
    │   ├── ConfigurationContext.tsx
    │   ├── FormContext.tsx
    │   └── SubmissionContext.tsx
    └── utlis/types.ts          # Type definitions
```

## Key Benefits

- **Single Source of Truth**: Context API provides centralized state management
- **Clean Separation**: Configuration, forms, and results are separate contexts
- **Immediate Feedback**: Real-time validation and status updates
- **User-Friendly**: Clear instructions and error messages
- **Maintainable**: Simple context structure easy to understand and extend
- **Type-Safe**: Full TypeScript support with proper type definitions