const fs = require('fs');
const path = require('path');

function cleanupFiles() {
    const folders = ['uploads', 'compressed'];
    const maxAge = 1 * 60 * 1000;    
    folders.forEach(folder => {
        const folderPath = path.join(__dirname, folder);
        
        if (!fs.existsSync(folderPath)) {
            console.log(`Folder ${folder} does not exist`);
            return;
        }
        
        const files = fs.readdirSync(folderPath);
        let deletedCount = 0;
        
        files.forEach(file => {
            const filePath = path.join(folderPath, file);
            const stats = fs.statSync(filePath);
            const fileAge = Date.now() - stats.mtimeMs;
            
            if (fileAge > maxAge) {
                try {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                    console.log(`✅ Deleted: ${file}`);
                } catch (err) {
                    console.log(`❌ Could not delete: ${file}`);
                }
            }
        });
        
        console.log(`Cleaned ${deletedCount} files from ${folder}/`);
    });
}

console.log('Starting cleanup...');
cleanupFiles();
console.log('Cleanup complete!');