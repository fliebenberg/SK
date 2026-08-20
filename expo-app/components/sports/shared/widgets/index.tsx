import React from 'react';
import { View, Text } from 'react-native';
import { ActionStep } from '@sk/shared';
import { CounterStep } from '../CounterStep';

/**
 * The registry of `CUSTOM_WIDGET` components, keyed by the `widgetName` a sport spec declares.
 *
 * A widget is a self-contained control: it is handed the step that declared it, the value
 * collected so far and a setter, and it owns everything else. The scoring dialog never learns
 * what a widget is for — it stores whatever comes back under the step's `dataKey` — so adding a
 * control for a new sport means writing a component and registering it here, and nothing else.
 *
 * `value` is deliberately opaque. Today every widget holds a number, but one that needs several
 * fields can return an object without the dialog changing.
 */
export interface WidgetProps {
  /** The step that declared this widget — its `name` labels the control. */
  step: ActionStep;
  value: any;
  onChange: (value: any) => void;
}

/**
 * A widget's entry in the registry: the control itself, and optionally how to describe its value
 * in one short phrase.
 */
export interface WidgetEntry {
  Component: React.ComponentType<WidgetProps>;
  /**
   * A few words describing `value` for the scoring dialog's step bar, or `undefined` when there
   * is nothing worth saying.
   *
   * This lives on the widget rather than in the step bar so that reading a value stays the
   * widget's business, exactly as rendering one is: the dialog asks "describe this" and prints
   * whatever comes back. Returning `undefined` is how a widget says its value is not worth
   * showing — an untouched counter should add no noise to the step bar.
   */
  summarise?: (value: any, step: ActionStep) => string | undefined;
}

/** A plain increment/decrement counter, e.g. rugby's scrum resets. */
function CounterWidget({ step, value, onChange }: WidgetProps) {
  return <CounterStep label={step.name || 'Count'} value={value || 0} onChange={onChange} />;
}

const WIDGETS: Record<string, WidgetEntry> = {
  ScrumResetsCounter: {
    Component: CounterWidget,
    summarise: (value) => {
      const count = Number(value) || 0;
      if (count <= 0) return undefined;
      return `${count} Reset${count === 1 ? '' : 's'}`;
    },
  },
};

/**
 * Renders the widget a step names.
 *
 * An unregistered `widgetName` says so on screen rather than falling back to some other control:
 * a spec asking for a stopwatch and silently getting a counter records the wrong number, and
 * nobody finds out until the data is read back.
 */
export function WidgetStep({ step, value, onChange }: WidgetProps) {
  const Widget = step.widgetName ? WIDGETS[step.widgetName]?.Component : undefined;

  if (!Widget) {
    return (
      <View className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
        <Text className="font-inter-bold text-xs text-amber-500">
          {step.widgetName ? `Unknown widget: ${step.widgetName}` : 'This step declares no widget.'}
        </Text>
      </View>
    );
  }

  return <Widget step={step} value={value} onChange={onChange} />;
}

/**
 * A short phrase describing what a widget currently holds, or `undefined` when the widget has
 * nothing worth showing — including when its name does not resolve, since an unregistered widget
 * has no one who can say what its value means.
 */
export function summariseWidget(step: ActionStep, value: any): string | undefined {
  const entry = step.widgetName ? WIDGETS[step.widgetName] : undefined;
  return entry?.summarise?.(value, step);
}

/** Whether a widget name resolves — for specs that want to check before rendering. */
export function isWidgetRegistered(widgetName: string | undefined): boolean {
  return !!widgetName && widgetName in WIDGETS;
}
