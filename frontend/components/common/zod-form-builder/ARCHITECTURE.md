# ZodFormBuilder Architecture

## Component Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      ZodFormBuilder                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ - Initialize react-hook-form                           │ │
│  │ - Setup FormProvider                                   │ │
│  │ - Render form with submit/reset buttons               │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       ZodFormField                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Route to appropriate renderer based on Zod type:       │ │
│  │ - ZodString    → renderStringField                     │ │
│  │ - ZodNumber    → renderNumberField                     │ │
│  │ - ZodBoolean   → renderBooleanField                    │ │
│  │ - ZodEnum      → renderEnumField                       │ │
│  │ - ZodArray     → ZodArrayField                         │ │
│  │ - ZodDefault   → ZodDefaultField                       │ │
│  │ - ZodOptional  → ZodFormField (recursive)              │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Renderers│    │  Array   │    │ Default  │
    │          │    │  Field   │    │  Field   │
    └──────────┘    └──────────┘    └──────────┘
```

## Module Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                         index.ts                             │
│                    (Public API exports)                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    ZodFormBuilder.tsx                        │
│                   (Main orchestrator)                        │
└───────────┬─────────────────────────────────────────────────┘
            │
            ├─────────────┬─────────────┬─────────────┐
            │             │             │             │
            ▼             ▼             ▼             ▼
    ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
    │field-        │ │ZodArray  │ │schema-   │ │zod-meta- │
    │renderers.tsx │ │Field.tsx │ │utils.ts  │ │types.ts  │
    └──────┬───────┘ └────┬─────┘ └──────────┘ └──────────┘
           │              │
           │              └──────────┐
           │                         │
           ▼                         ▼
    ┌──────────────┐         ┌──────────────┐
    │ZodField      │         │Field         │
    │Components.tsx│         │Controller.tsx│
    └──────────────┘         └──────────────┘
           │                         │
           └────────┬────────────────┘
                    │
                    ▼
            ┌──────────────┐
            │helpers.ts    │
            └──────────────┘
```

## Data Flow

### 1. Form Initialization
```
User Schema (Zod)
    │
    ▼
getObjectDefaults(schema)
    │
    ▼
useForm({ defaultValues })
    │
    ▼
FormProvider
```

### 2. Field Rendering
```
Schema Field
    │
    ▼
extractMetadata(description)
    │
    ├─── cleanDescription
    └─── metadata (checkbox, switch, searchable-select, etc.)
    │
    ▼
ZodFormField (routing)
    │
    ▼
Appropriate Renderer
    │
    ▼
FieldController (form state)
    │
    ▼
Field Component (UI)
```

### 3. Array Field Rendering
```
Array Schema
    │
    ▼
ZodArrayField
    │
    ├─── Check element type
    │    ├─── ZodEnum + metadata → renderSearchableMultiSelectField
    │    ├─── ZodString + metadata → renderSearchableMultiSelectField
    │    ├─── ZodObject → Nested form with add/remove
    │    └─── Primitive → Simple list with add/remove
    │
    ▼
useFieldArray (react-hook-form)
    │
    ▼
Rendered Array UI
```

## Responsibility Matrix

| Module | Responsibilities | Dependencies |
|--------|-----------------|--------------|
| **index.ts** | Public API exports | All modules |
| **ZodFormBuilder.tsx** | Form initialization, field routing | field-renderers, ZodArrayField, schema-utils |
| **field-renderers.tsx** | Pure rendering functions | ZodFieldComponents, FieldController |
| **ZodArrayField.tsx** | Array field logic, add/remove | field-renderers, schema-utils, ZodFormBuilder |
| **schema-utils.ts** | Schema parsing, defaults | zod-meta-types |
| **ZodFieldComponents.tsx** | Reusable field UI | UI components, helpers |
| **FieldController.tsx** | Form state wrapper | react-hook-form |
| **helpers.ts** | Label generation | string-helpers |
| **zod-meta-types.ts** | Metadata enums | None |

## Extension Points

### 1. Adding a New Field Type

```
1. Create renderer in field-renderers.tsx
   └─ export const renderNewField = (props: FieldRenderProps) => { ... }

2. Add case in ZodFormBuilder.tsx
   └─ case 'ZodNewType': return renderNewField(renderProps);

3. (Optional) Add metadata type in zod-meta-types.ts
   └─ NEW_METADATA = 'new-metadata'

4. (Optional) Add default value logic in schema-utils.ts
   └─ Update getDefaultValue() if needed
```

### 2. Adding a New Metadata Type

```
1. Add to zod-meta-types.ts
   └─ export enum ZodMetaType { NEW_TYPE = 'new-type' }

2. Handle in appropriate renderer
   └─ if (metadata === ZodMetaType.NEW_TYPE) { ... }
```

### 3. Custom Field Component

```
1. Create component in ZodFieldComponents.tsx
   └─ export const ZodCustomField = (props: BaseZodFieldProps) => { ... }

2. Create renderer in field-renderers.tsx
   └─ export const renderCustomField = (props: FieldRenderProps) => {
        return <FieldController render={() => <ZodCustomField ... />} />
      }

3. Use in ZodFormBuilder.tsx
   └─ Add case for your field type
```

## State Management

```
┌─────────────────────────────────────────────────────────────┐
│                    react-hook-form                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Form State                                             │ │
│  │ - Field values                                         │ │
│  │ - Validation errors                                    │ │
│  │ - Dirty/touched states                                 │ │
│  │ - Default values                                       │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      FormProvider                            │
│  (Context provider for form state)                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    FieldController                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ - Connects field to form state                         │ │
│  │ - Provides value, onChange, errors                     │ │
│  │ - Handles validation                                   │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Field Components                          │
│  (Render UI and handle user interactions)                    │
└─────────────────────────────────────────────────────────────┘
```

## Type Flow

```
Zod Schema (z.ZodObject)
    │
    ▼
ZodTypeAny (individual field)
    │
    ├─── _def.typeName → Field type identification
    ├─── _def.innerType → Unwrap Optional/Default
    ├─── _def.type → Array element type
    ├─── _def.values → Enum values
    ├─── description → Metadata + description
    └─── isOptional() → Required status
    │
    ▼
FieldRenderProps
    │
    ├─── name: string
    ├─── fieldInfo: ZodTypeAny
    ├─── cleanDescription: string
    ├─── metadata: ZodMetaType | null
    └─── isRequired: boolean
    │
    ▼
FieldControllerRenderProps
    │
    ├─── value: any
    ├─── invalid: boolean
    ├─── errors?: FieldError
    └─── onChange: (value: any) => void
    │
    ▼
Field Component Props
```

## Performance Characteristics

### Rendering
- **Initial render**: O(n) where n = number of fields
- **Field update**: O(1) - only affected field re-renders
- **Form validation**: O(n) - Zod validates all fields

### Memory
- **Form state**: O(n) - one entry per field
- **Field arrays**: O(n*m) where m = items in array
- **Memoization**: None needed - react-hook-form handles optimization

### Bundle Size
- **Main component**: ~5KB (minified)
- **Field renderers**: ~3KB (minified)
- **Utilities**: ~2KB (minified)
- **Total**: ~10KB (excluding dependencies)

## Testing Strategy

### Unit Tests
```
schema-utils.ts
├─ extractMetadata()
├─ parseOptionsFromDescription()
├─ getDefaultValue()
└─ getObjectDefaults()

field-renderers.tsx
├─ renderStringField()
├─ renderNumberField()
├─ renderBooleanField()
├─ renderEnumField()
├─ renderSearchableSelectField()
└─ renderSearchableMultiSelectField()
```

### Integration Tests
```
ZodFormBuilder
├─ Renders all field types correctly
├─ Handles form submission
├─ Validates fields
├─ Resets form
└─ Handles nested objects and arrays
```

### E2E Tests
```
Complete form flow
├─ Fill out form
├─ Validate errors
├─ Submit form
└─ Verify data
```
