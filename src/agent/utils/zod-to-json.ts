import type { z } from 'zod';

export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def;

  if (def.typeName === 'ZodObject') {
    const shape = def.shape();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodTypeAny);
      const fieldDef = (value as z.ZodTypeAny)._def;
      if (fieldDef.typeName !== 'ZodOptional' && fieldDef.typeName !== 'ZodDefault') {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (def.typeName === 'ZodString') {
    return {
      type: 'string',
      description: def.description,
    };
  }

  if (def.typeName === 'ZodNumber') {
    return {
      type: 'number',
      description: def.description,
    };
  }

  if (def.typeName === 'ZodBoolean') {
    return {
      type: 'boolean',
      description: def.description,
    };
  }

  if (def.typeName === 'ZodEnum') {
    return {
      type: 'string',
      enum: def.values,
      description: def.description,
    };
  }

  if (def.typeName === 'ZodArray') {
    return {
      type: 'array',
      items: zodToJsonSchema(def.type),
      description: def.description,
    };
  }

  if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') {
    return zodToJsonSchema(def.innerType);
  }

  return { type: 'string' };
}
