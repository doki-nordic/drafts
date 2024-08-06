
/**
 * Contains original and transformed source code with a mapping allowing fetching line number and column of 
 * original source from provided character offset in transformed source.
 */
export class SourceMap {

    /**
     * Create new SourceMap object.
     * @param fileName Source file name. Used for getting location in text format.
     * @param map Mapping between original and transformed source. Array index is line number in original source,
     *            value is offset in transformed source where the line starts.
     */
    public constructor(
        public fileName: string,
        private map: number[],
    ) {
    }

    /**
     * Get location based on character offset.
     * @param offset Character offset in transformed source code.
     * @returns line and column number respectively.
     */
    public getLocation(offset: number): [number, number] {
        let min = 0;
        let max = this.map.length - 1;
        while (min < max) {
            let mid = (min + max + 1) >> 1;
            let value = this.map[mid];
            if (offset < value) {
                max = mid - 1;
            } else {
                min = mid;
            }
        }
        let lineBegin = this.map[min];
        return [min, offset - lineBegin];
    }

    /**
     * Get location based on character offset.
     * @param offset Character offset in transformed source code.
     * @returns Location in "file.name:line:column" format.
     */
    public getLocationText(offset: number): string {
        let [line, column] = this.getLocation(offset);
        return `${this.fileName}:${line}:${column}`;
    }

    // NICE_TO_HAVE: getLocationContext(offset: number): string - return source file line content and ASCII art pointer to location.
}
