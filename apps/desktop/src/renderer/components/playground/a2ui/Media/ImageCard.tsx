/**
 * ImageCard Component
 * Displays an image with title, description, source attribution, and lazy loading.
 */
import React, { useState } from 'react';
import { Card, CardDescription, CardHeader, CardTitle, CardFooter } from '../../../ui/card';
import { Button } from '../../../ui/button';

export interface ImageCardProps {
  title?: string;
  description?: string;
  image_url: string;
  alt_text?: string;
  source?: string;
  url?: string;
  height?: string;
}

export function ImageCard({ title, description, image_url, alt_text, source, url, height = 'h-64' }: ImageCardProps): React.ReactElement {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <Card className="overflow-hidden bg-card border-border">
      <div className={`relative ${height} bg-secondary`}>
        {!imageError ? (
          <>
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <img
              src={image_url} alt={alt_text || title || 'Image'}
              className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="lazy" onError={() => setImageError(true)} onLoad={() => setImageLoaded(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-secondary">
            <div className="text-center text-muted-foreground p-4">
              <svg className="w-16 h-16 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Image not available</p>
            </div>
          </div>
        )}
      </div>
      {(title || description || source) && (
        <CardHeader>
          {title && <CardTitle className="text-base text-foreground">{title}</CardTitle>}
          {(description || source) && (
            <CardDescription className="text-muted-foreground">
              {description}{description && source && ' \u2022 '}{source && `Source: ${source}`}
            </CardDescription>
          )}
        </CardHeader>
      )}
      {url && (
        <CardFooter>
          <Button asChild variant="outline" className="w-full border-border text-muted-foreground hover:bg-primary/10 hover:text-foreground">
            <a href={url} target="_blank" rel="noopener noreferrer">View Original</a>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default ImageCard;
