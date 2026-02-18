/**
 * PricingTable Component
 * Pricing tier comparison table with multiple plans.
 */
import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../../../ui/card';
import { Button } from '../../../ui/button';

export interface PricingPlan {
  name: string;
  price: string | number;
  period?: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  cta?: string;
  description?: string;
  currency?: string;
}

export interface PricingTableProps {
  tiers?: PricingPlan[];
  plans?: PricingPlan[];
  currency?: string;
  title?: string;
  subtitle?: string;
  columns?: number;
}

export function PricingTable({ tiers, plans, currency = '$', title, subtitle }: PricingTableProps): React.ReactElement {
  const pricingPlans = tiers || plans || [];

  return (
    <div className="space-y-4">
      {(title || subtitle) && (
        <div className="text-center space-y-2">
          {title && <h2 className="text-2xl font-bold text-foreground">{title}</h2>}
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))` }}>
        {pricingPlans.map((plan: PricingPlan, idx: number) => (
          <Card key={idx} className={`relative bg-card ${plan.highlighted ? 'border-primary border-2 shadow-lg' : 'border-border'}`}>
            {(plan.highlighted || plan.badge) && (
              <div className="bg-primary text-primary-foreground text-center py-1 text-xs font-semibold rounded-t-lg">
                {plan.badge || 'POPULAR'}
              </div>
            )}
            <CardHeader className="pb-4">
              <CardTitle className="text-base text-foreground">{plan.name}</CardTitle>
              {plan.description && <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>}
              <div className="text-3xl font-bold text-foreground mt-2">
                {typeof plan.price === 'number' ? <>{plan.currency || currency}{plan.price}</> : plan.price}
                {plan.period && <span className="text-sm text-muted-foreground font-normal">/{plan.period}</span>}
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2">
                {plan.features?.map((feature: string, fIdx: number) => (
                  <li key={fIdx} className="text-sm flex items-start gap-2 text-foreground/80">
                    <span className="text-primary mt-0.5">{'\u2713'}</span><span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="pt-4">
              <Button className="w-full" variant={plan.highlighted ? 'primary' : 'outline'}>
                {plan.cta || 'Get Started'}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default PricingTable;
