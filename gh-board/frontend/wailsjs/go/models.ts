export namespace main {
	
	export class BatchResult {
	    full_name: string;
	    success: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new BatchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.full_name = source["full_name"];
	        this.success = source["success"];
	        this.error = source["error"];
	    }
	}
	export class Repository {
	    id: number;
	    name: string;
	    full_name: string;
	    private: boolean;
	    stargazers_count: number;
	    // Go type: time
	    pushed_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Repository(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.full_name = source["full_name"];
	        this.private = source["private"];
	        this.stargazers_count = source["stargazers_count"];
	        this.pushed_at = this.convertValues(source["pushed_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

