export interface TechnologySignature {
    name: string;
    type: 'header' | 'html' | 'meta' | 'script';
    pattern: string; 
}

export interface TechnologyFound {
    name: string;
    proof: string;
}

export interface DetectionResult {
    domain: string;
    technologies: TechnologyFound[];
    error?: string;
}