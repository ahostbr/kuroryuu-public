/**
 * Parameter Form
 *
 * Dynamic form builder from JSON schema.
 */
import React from 'react';
import type { ToolSchema, ParameterSchema } from '../../../types/command-center';

interface ParameterFormProps {
  schema: ToolSchema['inputSchema'];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function ParameterForm({ schema, values, onChange }: ParameterFormProps) {
  const { properties, required = [] } = schema;

  return (
    <div className="space-y-4">
      {Object.entries(properties).map(([key, paramSchema]) => (
        <ParameterField
          key={key}
          name={key}
          schema={paramSchema}
          value={values[key]}
          isRequired={required.includes(key)}
          onChange={(value) => onChange(key, value)}
        />
      ))}
    </div>
  );
}

interface ParameterFieldProps {
  name: string;
  schema: ParameterSchema;
  value: unknown;
  isRequired: boolean;
  onChange: (value: unknown) => void;
}

function ParameterField({ name, schema, value, isRequired, onChange }: ParameterFieldProps) {
  const { type, description, enum: enumValues, default: defaultValue } = schema;

  // Use default value if no value set
  const currentValue = value ?? defaultValue;

  // Render different input types based on schema
  const renderInput = () => {
    // Enum (select)
    if (enumValues && enumValues.length > 0) {
      return (
        <select
          value={(currentValue as string) || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="w-full px-3 py-2 bg-secondary rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Select {name}...</option>
          {enumValues.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    // Boolean (checkbox)
    if (type === 'boolean') {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(currentValue)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
          />
          <span className="text-sm text-foreground">
            {description || `Enable ${name}`}
          </span>
        </label>
      );
    }

    // Number/Integer
    if (type === 'number' || type === 'integer') {
      return (
        <input
          type="number"
          value={currentValue !== undefined ? String(currentValue) : ''}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '') {
              onChange(undefined);
            } else {
              onChange(type === 'integer' ? parseInt(val, 10) : parseFloat(val));
            }
          }}
          step={type === 'integer' ? 1 : 'any'}
          placeholder={description || `Enter ${name}...`}
          className="w-full px-3 py-2 bg-secondary rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      );
    }

    // Object or Array (JSON textarea)
    if (type === 'object' || type === 'array') {
      const jsonValue = currentValue !== undefined ? JSON.stringify(currentValue, null, 2) : '';

      return (
        <textarea
          value={jsonValue}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '') {
              onChange(undefined);
            } else {
              try {
                onChange(JSON.parse(val));
              } catch {
                // Keep invalid JSON as-is to allow editing
              }
            }
          }}
          placeholder={`Enter ${type} as JSON...`}
          rows={4}
          className="w-full px-3 py-2 bg-secondary rounded-lg text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
        />
      );
    }

    // String (default)
    return (
      <input
        type="text"
        value={(currentValue as string) || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={description || `Enter ${name}...`}
        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    );
  };

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {name}
        {isRequired && <span className="text-destructive">*</span>}
        <span className="text-xs text-muted-foreground font-normal">({type})</span>
      </label>

      {renderInput()}

      {description && type !== 'boolean' && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export default ParameterForm;
