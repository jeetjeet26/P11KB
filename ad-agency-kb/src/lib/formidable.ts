
import type { IncomingMessage } from 'http';
import type { NextApiRequest } from 'next';
import formidable from 'formidable';

export const parseForm = (req: NextApiRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> => {
    return new Promise((resolve, reject) => {
        const form = formidable({ 
            multiples: false,
            // Keeping files on disk allows for streaming and processing larger files 
            // without hitting memory limits.
            keepExtensions: true, 
        });

        form.parse(req as unknown as IncomingMessage, (err, fields, files) => {
            if (err) {
                return reject(err);
            }
            resolve({ fields, files });
        });
    });
}; 