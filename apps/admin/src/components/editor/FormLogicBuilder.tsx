/**
 * ==========================================================================
 * Form Logic Builder Component
 * ==========================================================================
 *
 * Visual interface for building form logic:
 * - Validation rules
 * - Conditional fields
 * - Submit actions (email, webhook, database)
 */

import React, { useState, useCallback } from 'react';

// ==========================================================================
// TYPES
// ==========================================================================

export type ValidationRule =
    | { type: 'required'; message: string }
    | { type: 'email'; message: string }
    | { type: 'minLength'; value: number; message: string }
    | { type: 'maxLength'; value: number; message: string }
    | { type: 'pattern'; value: string; message: string }
    | { type: 'min'; value: number; message: string }
    | { type: 'max'; value: number; message: string };

export interface ConditionalLogic {
    fieldId: string;
    operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'isEmpty' | 'isNotEmpty';
    value?: string;
    action: 'show' | 'hide' | 'require' | 'disable';
}

export interface SubmitAction {
    type: 'email' | 'webhook' | 'database' | 'redirect';
    config: Record<string, unknown>;
}

export interface FormField {
    id: string;
    name: string;
    type: string;
    validations: ValidationRule[];
    conditionals: ConditionalLogic[];
}

export interface FormConfig {
    fields: FormField[];
    submitActions: SubmitAction[];
    successMessage: string;
    errorMessage: string;
}

interface FormLogicBuilderProps {
    formConfig: FormConfig;
    onChange: (config: FormConfig) => void;
    availableFields: Array<{ id: string; name: string; type: string }>;
}

// ==========================================================================
// CONSTANTS
// ==========================================================================

const VALIDATION_TYPES = [
    { value: 'required', label: 'Required', hasValue: false },
    { value: 'email', label: 'Valid Email', hasValue: false },
    { value: 'minLength', label: 'Min Length', hasValue: true },
    { value: 'maxLength', label: 'Max Length', hasValue: true },
    { value: 'pattern', label: 'Regex Pattern', hasValue: true },
    { value: 'min', label: 'Min Value', hasValue: true },
    { value: 'max', label: 'Max Value', hasValue: true },
] as const;

const CONDITION_OPERATORS = [
    { value: 'equals', label: 'Equals' },
    { value: 'notEquals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'notContains', label: 'Does Not Contain' },
    { value: 'isEmpty', label: 'Is Empty' },
    { value: 'isNotEmpty', label: 'Is Not Empty' },
] as const;

const CONDITION_ACTIONS = [
    { value: 'show', label: 'Show this field' },
    { value: 'hide', label: 'Hide this field' },
    { value: 'require', label: 'Make required' },
    { value: 'disable', label: 'Disable field' },
] as const;

const SUBMIT_ACTION_TYPES = [
    { value: 'email', label: '📧 Send Email', icon: '📧' },
    { value: 'webhook', label: '🔗 Webhook', icon: '🔗' },
    { value: 'database', label: '💾 Save to Database', icon: '💾' },
    { value: 'redirect', label: '↗️ Redirect', icon: '↗️' },
] as const;

// ==========================================================================
// STYLES
// ==========================================================================

const styles = {
    container: {
        padding: '16px',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
    } as React.CSSProperties,
    section: {
        marginBottom: '20px',
    } as React.CSSProperties,
    sectionTitle: {
        fontSize: '13px',
        fontWeight: 600,
        color: '#374151',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    } as React.CSSProperties,
    card: {
        padding: '12px',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        marginBottom: '8px',
    } as React.CSSProperties,
    row: {
        display: 'flex',
        gap: '8px',
        marginBottom: '8px',
        alignItems: 'center',
    } as React.CSSProperties,
    select: {
        flex: 1,
        padding: '8px',
        border: '1px solid #d1d5db',
        borderRadius: '4px',
        fontSize: '13px',
    } as React.CSSProperties,
    input: {
        flex: 1,
        padding: '8px',
        border: '1px solid #d1d5db',
        borderRadius: '4px',
        fontSize: '13px',
    } as React.CSSProperties,
    addButton: {
        padding: '8px 12px',
        backgroundColor: '#e0e7ff',
        color: '#4338ca',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
    } as React.CSSProperties,
    removeButton: {
        padding: '6px',
        backgroundColor: 'transparent',
        color: '#ef4444',
        border: 'none',
        cursor: 'pointer',
        fontSize: '14px',
    } as React.CSSProperties,
    tabs: {
        display: 'flex',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '16px',
    } as React.CSSProperties,
    tab: {
        padding: '8px 16px',
        fontSize: '13px',
        fontWeight: 500,
        color: '#6b7280',
        background: 'none',
        border: 'none',
        borderBottom: '2px solid transparent',
        cursor: 'pointer',
    } as React.CSSProperties,
    activeTab: {
        color: '#3b82f6',
        borderBottomColor: '#3b82f6',
    } as React.CSSProperties,
};

// ==========================================================================
// SUB-COMPONENTS
// ==========================================================================

interface ValidationRuleEditorProps {
    rule: ValidationRule;
    onChange: (rule: ValidationRule) => void;
    onRemove: () => void;
}

function ValidationRuleEditor({ rule, onChange, onRemove }: ValidationRuleEditorProps) {
    const typeConfig = VALIDATION_TYPES.find((t) => t.value === rule.type);

    return (
        <div style={styles.card}>
            <div style={styles.row}>
                <select
                    style={styles.select}
                    value={rule.type}
                    onChange={(e) =>
                        onChange({ ...rule, type: e.target.value as ValidationRule['type'] } as ValidationRule)
                    }
                >
                    {VALIDATION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                            {t.label}
                        </option>
                    ))}
                </select>

                {typeConfig?.hasValue && (
                    <input
                        type="text"
                        style={{ ...styles.input, flex: 0.5 }}
                        value={(rule as { value?: unknown }).value?.toString() || ''}
                        onChange={(e) => onChange({ ...rule, value: e.target.value } as ValidationRule)}
                        placeholder="Value"
                    />
                )}

                <button style={styles.removeButton} onClick={onRemove}>
                    ✕
                </button>
            </div>

            <input
                type="text"
                style={styles.input}
                value={rule.message}
                onChange={(e) => onChange({ ...rule, message: e.target.value } as ValidationRule)}
                placeholder="Error message"
            />
        </div>
    );
}

interface ConditionalLogicEditorProps {
    condition: ConditionalLogic;
    availableFields: Array<{ id: string; name: string }>;
    onChange: (condition: ConditionalLogic) => void;
    onRemove: () => void;
}

function ConditionalLogicEditor({
    condition,
    availableFields,
    onChange,
    onRemove,
}: ConditionalLogicEditorProps) {
    const showValue = !['isEmpty', 'isNotEmpty'].includes(condition.operator);

    return (
        <div style={styles.card}>
            <div style={styles.row}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>When</span>
                <select
                    style={styles.select}
                    value={condition.fieldId}
                    onChange={(e) => onChange({ ...condition, fieldId: e.target.value })}
                >
                    <option value="">Select field...</option>
                    {availableFields.map((f) => (
                        <option key={f.id} value={f.id}>
                            {f.name}
                        </option>
                    ))}
                </select>
            </div>

            <div style={styles.row}>
                <select
                    style={styles.select}
                    value={condition.operator}
                    onChange={(e) =>
                        onChange({ ...condition, operator: e.target.value as ConditionalLogic['operator'] })
                    }
                >
                    {CONDITION_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                            {op.label}
                        </option>
                    ))}
                </select>

                {showValue && (
                    <input
                        type="text"
                        style={styles.input}
                        value={condition.value || ''}
                        onChange={(e) => onChange({ ...condition, value: e.target.value })}
                        placeholder="Value"
                    />
                )}
            </div>

            <div style={styles.row}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Then</span>
                <select
                    style={styles.select}
                    value={condition.action}
                    onChange={(e) =>
                        onChange({ ...condition, action: e.target.value as ConditionalLogic['action'] })
                    }
                >
                    {CONDITION_ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                            {a.label}
                        </option>
                    ))}
                </select>

                <button style={styles.removeButton} onClick={onRemove}>
                    ✕
                </button>
            </div>
        </div>
    );
}

interface SubmitActionEditorProps {
    action: SubmitAction;
    onChange: (action: SubmitAction) => void;
    onRemove: () => void;
}

function SubmitActionEditor({ action, onChange, onRemove }: SubmitActionEditorProps) {
    return (
        <div style={styles.card}>
            <div style={styles.row}>
                <select
                    style={styles.select}
                    value={action.type}
                    onChange={(e) => onChange({ ...action, type: e.target.value as SubmitAction['type'] })}
                >
                    {SUBMIT_ACTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                            {t.label}
                        </option>
                    ))}
                </select>
                <button style={styles.removeButton} onClick={onRemove}>
                    ✕
                </button>
            </div>

            {/* Type-specific config */}
            {action.type === 'email' && (
                <>
                    <input
                        type="text"
                        style={{ ...styles.input, marginBottom: '8px' }}
                        value={(action.config.to as string) || ''}
                        onChange={(e) =>
                            onChange({ ...action, config: { ...action.config, to: e.target.value } })
                        }
                        placeholder="To email address"
                    />
                    <input
                        type="text"
                        style={styles.input}
                        value={(action.config.subject as string) || ''}
                        onChange={(e) =>
                            onChange({ ...action, config: { ...action.config, subject: e.target.value } })
                        }
                        placeholder="Email subject"
                    />
                </>
            )}

            {action.type === 'webhook' && (
                <input
                    type="text"
                    style={styles.input}
                    value={(action.config.url as string) || ''}
                    onChange={(e) =>
                        onChange({ ...action, config: { ...action.config, url: e.target.value } })
                    }
                    placeholder="Webhook URL"
                />
            )}

            {action.type === 'redirect' && (
                <input
                    type="text"
                    style={styles.input}
                    value={(action.config.url as string) || ''}
                    onChange={(e) =>
                        onChange({ ...action, config: { ...action.config, url: e.target.value } })
                    }
                    placeholder="Redirect URL"
                />
            )}

            {action.type === 'database' && (
                <input
                    type="text"
                    style={styles.input}
                    value={(action.config.table as string) || 'form_submissions'}
                    onChange={(e) =>
                        onChange({ ...action, config: { ...action.config, table: e.target.value } })
                    }
                    placeholder="Table name"
                />
            )}
        </div>
    );
}

// ==========================================================================
// MAIN COMPONENT
// ==========================================================================

export function FormLogicBuilder({
    formConfig,
    onChange,
    availableFields,
}: FormLogicBuilderProps) {
    const [activeTab, setActiveTab] = useState<'validation' | 'conditional' | 'submit'>(
        'validation'
    );
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
        availableFields[0]?.id || null
    );

    const selectedField = formConfig.fields.find((f) => f.id === selectedFieldId);

    const updateField = useCallback(
        (fieldId: string, updates: Partial<FormField>) => {
            const newFields = formConfig.fields.map((f) =>
                f.id === fieldId ? { ...f, ...updates } : f
            );
            onChange({ ...formConfig, fields: newFields });
        },
        [formConfig, onChange]
    );

    const addValidation = useCallback(() => {
        if (!selectedFieldId || !selectedField) return;
        const newRule: ValidationRule = { type: 'required', message: 'This field is required' };
        updateField(selectedFieldId, {
            validations: [...selectedField.validations, newRule],
        });
    }, [selectedFieldId, selectedField, updateField]);

    const addConditional = useCallback(() => {
        if (!selectedFieldId || !selectedField) return;
        const newCondition: ConditionalLogic = {
            fieldId: '',
            operator: 'equals',
            value: '',
            action: 'show',
        };
        updateField(selectedFieldId, {
            conditionals: [...selectedField.conditionals, newCondition],
        });
    }, [selectedFieldId, selectedField, updateField]);

    const addSubmitAction = useCallback(() => {
        const newAction: SubmitAction = { type: 'email', config: {} };
        onChange({
            ...formConfig,
            submitActions: [...formConfig.submitActions, newAction],
        });
    }, [formConfig, onChange]);

    return (
        <div style={styles.container}>
            <h3
                style={{
                    margin: '0 0 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#111827',
                }}
            >
                Form Logic Builder
            </h3>

            {/* Field selector */}
            <div style={styles.section}>
                <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>
                    Configure field:
                </label>
                <select
                    style={styles.select}
                    value={selectedFieldId || ''}
                    onChange={(e) => setSelectedFieldId(e.target.value)}
                >
                    {availableFields.map((f) => (
                        <option key={f.id} value={f.id}>
                            {f.name} ({f.type})
                        </option>
                    ))}
                </select>
            </div>

            {/* Tabs */}
            <div style={styles.tabs}>
                {(['validation', 'conditional', 'submit'] as const).map((tab) => (
                    <button
                        key={tab}
                        style={{
                            ...styles.tab,
                            ...(activeTab === tab ? styles.activeTab : {}),
                        }}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'validation' && '✓ Validation'}
                        {tab === 'conditional' && '⚡ Conditions'}
                        {tab === 'submit' && '📤 Actions'}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'validation' && selectedField && (
                <div>
                    {selectedField.validations.map((rule, idx) => (
                        <ValidationRuleEditor
                            key={idx}
                            rule={rule}
                            onChange={(newRule) => {
                                const newRules = [...selectedField.validations];
                                newRules[idx] = newRule;
                                updateField(selectedField.id, { validations: newRules });
                            }}
                            onRemove={() => {
                                const newRules = selectedField.validations.filter((_, i) => i !== idx);
                                updateField(selectedField.id, { validations: newRules });
                            }}
                        />
                    ))}
                    <button style={styles.addButton} onClick={addValidation}>
                        + Add Validation Rule
                    </button>
                </div>
            )}

            {activeTab === 'conditional' && selectedField && (
                <div>
                    {selectedField.conditionals.map((cond, idx) => (
                        <ConditionalLogicEditor
                            key={idx}
                            condition={cond}
                            availableFields={availableFields}
                            onChange={(newCond) => {
                                const newConds = [...selectedField.conditionals];
                                newConds[idx] = newCond;
                                updateField(selectedField.id, { conditionals: newConds });
                            }}
                            onRemove={() => {
                                const newConds = selectedField.conditionals.filter((_, i) => i !== idx);
                                updateField(selectedField.id, { conditionals: newConds });
                            }}
                        />
                    ))}
                    <button style={styles.addButton} onClick={addConditional}>
                        + Add Condition
                    </button>
                </div>
            )}

            {activeTab === 'submit' && (
                <div>
                    {formConfig.submitActions.map((action, idx) => (
                        <SubmitActionEditor
                            key={idx}
                            action={action}
                            onChange={(newAction) => {
                                const newActions = [...formConfig.submitActions];
                                newActions[idx] = newAction;
                                onChange({ ...formConfig, submitActions: newActions });
                            }}
                            onRemove={() => {
                                const newActions = formConfig.submitActions.filter((_, i) => i !== idx);
                                onChange({ ...formConfig, submitActions: newActions });
                            }}
                        />
                    ))}
                    <button style={styles.addButton} onClick={addSubmitAction}>
                        + Add Submit Action
                    </button>

                    {/* Success/Error messages */}
                    <div style={{ marginTop: '16px' }}>
                        <label style={{ fontSize: '12px', color: '#6b7280' }}>Success Message:</label>
                        <input
                            type="text"
                            style={{ ...styles.input, marginTop: '4px' }}
                            value={formConfig.successMessage}
                            onChange={(e) => onChange({ ...formConfig, successMessage: e.target.value })}
                            placeholder="Form submitted successfully!"
                        />
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <label style={{ fontSize: '12px', color: '#6b7280' }}>Error Message:</label>
                        <input
                            type="text"
                            style={{ ...styles.input, marginTop: '4px' }}
                            value={formConfig.errorMessage}
                            onChange={(e) => onChange({ ...formConfig, errorMessage: e.target.value })}
                            placeholder="Something went wrong. Please try again."
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default FormLogicBuilder;
