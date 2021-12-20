const parseSparqlResults = (data) => {
    const vars = data.head.vars;
    return data.results.bindings.map((binding) => {
        let obj = {};

        vars.forEach((varKey) => {
            if (binding[varKey]) {
                obj[varKey] = binding[varKey].value;
            } else {
                obj[varKey] = null;
            }
        });
        return obj;
    });
};

export {parseSparqlResults};
