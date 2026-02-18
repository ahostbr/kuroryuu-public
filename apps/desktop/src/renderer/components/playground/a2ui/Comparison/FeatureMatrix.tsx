/**
 * FeatureMatrix Component
 * Matrix-style table showing feature availability across multiple items/products.
 */
import React from 'react';
import { Card, CardContent } from '../../../ui/card';

export interface FeatureAvailability {
  name: string;
  description?: string;
  availability: boolean[];
}

export interface MatrixItem {
  name: string;
  features: boolean[];
  highlighted?: boolean;
}

export interface FeatureMatrixProps {
  features: string[] | FeatureAvailability[];
  products?: string[];
  items?: MatrixItem[];
  title?: string;
  subtitle?: string;
}

export function FeatureMatrix({ features, products, items, title, subtitle }: FeatureMatrixProps): React.ReactElement {
  let featureList: FeatureAvailability[];
  let productList: string[];

  if (items && items.length > 0) {
    productList = items.map(item => item.name);
    const featureCount = items[0]?.features.length || 0;
    featureList = Array.from({ length: featureCount }, (_, i) => ({
      name: typeof features[i] === 'string' ? features[i] as string : (features[i] as FeatureAvailability)?.name || `Feature ${i + 1}`,
      availability: items.map(item => item.features[i] || false),
    }));
  } else {
    productList = products || [];
    featureList = features.map(f => typeof f === 'string' ? { name: f, availability: [] } : f);
  }

  return (
    <Card className="bg-card border-border">
      {(title || subtitle) && (
        <div className="p-4 border-b border-border">
          {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Feature</th>
                {productList?.map((product: string, idx: number) => (
                  <th key={idx} className="px-4 py-3 text-center text-sm font-semibold text-foreground">{product}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureList?.map((feature: FeatureAvailability, idx: number) => (
                <tr key={idx} className={`border-b last:border-0 border-border ${idx % 2 === 0 ? 'bg-secondary/20' : 'bg-transparent'}`}>
                  <td className="px-4 py-3 text-sm font-medium text-foreground/80">
                    <div>
                      {feature.name}
                      {feature.description && <div className="text-xs text-muted-foreground mt-1">{feature.description}</div>}
                    </div>
                  </td>
                  {feature.availability.map((avail: boolean, pIdx: number) => (
                    <td key={pIdx} className="px-4 py-3 text-center">
                      <span className={`text-lg ${avail ? 'text-primary' : 'text-muted-foreground/30'}`}>{avail ? '\u2713' : '\u2717'}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default FeatureMatrix;
