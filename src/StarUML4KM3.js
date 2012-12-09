var /*string*/              version = "1.5" ;    	// version of this tool
var /*StarUMLApplication*/  staruml ;	            // StarUML application
var /*FileSystemObject*/    filesystem;	          // access to the file system
var /*string*/              targetDirectory;		  // pathname of the target directory
var /*TextStream*/          km3File;   			      // current km3 file used for output
var /*int*/                 indentation;	        // current indentation level
var /*string*/              indentString;			    // current indentation
var /*array[string]*/       keywordsArray ;	      // list of all KM3 keywords
var /*string*/              optionSchemaId ;			// id of the staruml option schema
var /*boolean*/             generateRoleNamesOpt; // generate a name for unamed roles ? or produce errors
var /*boolean*/             generateCommentsOpt; 	// indicate wether comments should be generated or not  
var /*integer*/             errors ;				      // number of errors
{

  // Connect to StarUML
	staruml = new ActiveXObject("StarUML.StarUMLApplication") ;
  
  // Connect to FileSystem
	filesystem = new ActiveXObject("scripting.FileSystemobject");
	if (filesystem==null) {
		staruml.Log("[ERROR] : can't access to the filesystem") ;
	}		   
  
  // Get module parameters
  optionSchemaId = "StarUML.StarUML4KM3" ;
	generateRoleNamesOpt = staruml.GetOptionValue(optionSchemaId, "generateRoleNames") ;
	generateCommentsOpt = staruml.GetOptionValue(optionSchemaId, "generateComments") ;
  generateConstraintsOpt = staruml.GetOptionValue(optionSchemaId, "generateConstraints") ;
  
  keywordsArray 
    = new Array("package", "class", "reference", "attribute", "extends",
     		        "abstract", "ordered", "container", "oppositeOf", "enumeration", 
                "literal", "datatype") ;
	targetDirectory = staruml.ProjectManager.FileName.replace( /\.uml$/, "_km3") ;
	generateKM3Files() ;
}

/* --------------------------------------------------------------------------------- */
/* generate KM3 files for the current project                                        */
/* --------------------------------------------------------------------------------- */
function generateKM3Files() {
  var /*UMLProject*/ project = staruml.GetProject() ;
	if (! project) {
	  staruml.Log("[ERROR] : no acces to a project") ;
	  return ; /* TODO should raise an exception */
  }
	staruml.ClearHistory() ;
	startTrace() ;
	errors = 0 ;

  staruml.Log("====== KM3 Generator version "+version+" =======") ;	
  staruml.Log("  Generating KM3 files in directory "+targetDirectory) ;
	staruml.Log("  Generation in progress ... (see StarUML \"Message\" panel for further information)") ;
	
	if(!(filesystem.FolderExists(targetDirectory))){
		filesystem.CreateFolder(targetDirectory);
	} /* TODO should add an option to clean the directory if existing */
	
  indentation = 0;
	setIndentation(indentation) ; 
	visitUMLNameSpace(staruml.GetProject());
	staruml.Log("  KM3 files generated") ;
	if (errors) {
	  staruml.Log(" >>> "+errors+" ERRORS FOUND. (see the \"Message\" panel for further information)") ;
	}
}


/** ------------------------------------------------------------------------------
 * This function visit recursively a namespace and apply the following conversion
 * for each element in the name space
 *    UML package => KM3 File containing UML Packages
 *    UML class => KM3 class
 *    UML enumeration => KM3 enumeration
 *    UML namespace => recursion
 * -------------------------------------------------------------------*/
function /*void*/ visitUMLNameSpace(/*UMLNameSpace*/ namespace){
 
	var /*UMLElement*/ element;

	for (var i = 0; i < namespace.GetOwnedElementCount(); i++){// take all the elements in the project
		element = namespace.GetOwnedElementAt(i);

    //-------- visit UML Package
		if(element.IsKindOf("UMLPackage")) { 
		
			// create the KM3 file and initialise the km3File var to write into this file
			km3File = filesystem.CreateTextFile(UMLPackage_TO_KM3FileName(element), true, false);
			if (km3File == null) {
				staruml.Log("[ERROR] : can't create" + element.Name +".km3");
			}
			trace(element,indentString+"package "+element.Name) ;
			UMLDocumentation_TO_KM3Comment(element.Documentation) ;
			km3File.writeline("package "+UMLName_TO_KM3Name(element.Name)+" {");
			km3File.writeline("") ;
			
    // visit UML Class  
		} else if (element.IsKindOf("UMLClass")){// process a class
			UMLClass_TO_KM3Class(element, namespace);
		
    // visit UML Enumeration    
		} else if (element.IsKindOf("UMLEnumeration")){// process an enumeration
			UMLEnumeration_TO_KM3Enumeration(element);
		}

		if (element.IsKindOf("UMLNamespace")) {// the recursive case
			visitUMLNameSpace(element);
		}

		if (element.isKindOf("UMLPackage")) {// end of the model processing
			km3File.writeline("} -- "+UMLName_TO_KM3Name(element.Name));
			km3File.writeline("") ;
			create_KM3PrimitivesTypesPackage();
		}
	} //for

} //visitUMLNameSpace




function /*string*/ UMLPackage_TO_KM3FileName(/*UMLPackage*/ __package ) {
  return targetDirectory + '/' + __package.Name + ".km3"
}

/* -------------------------------------------------------------------------------------------------------------  */
/* take the different primitive types in the model element, using the StarUML Metamodel */
/* then write the package itself                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------- */
function create_KM3PrimitivesTypesPackage() {
	var metamodel = staruml.MetaModel;
	var metaAttribute = metamodel.FindMetaClass("UMLAttribute");
	var attrArray = new Array();
	for (var i = 0; i < metaAttribute.GetInstanceCount(); i++){
		var currentAttrType = metaAttribute.GetInstanceAt(i).TypeExpression;
		if (!(attrInTab(currentAttrType, attrArray))) {
			attrArray.push(currentAttrType);
		}
	}

	km3File.writeline("package PrimitiveTypes {");
	for (var j = 0; j < attrArray.length; j++) {
		km3File.writeline("\tdatatype "+attrArray[j]+";");
	}
	km3File.writeline("} -- PrimitiveTypes");
	km3File.writeline();
}


/* ---------------------------------------------------------------- */
/* create the header of the class, e.g. abstract or not */
/* then parse the attributes and the references          */
/* --------------------------------------------------------------- */
function UMLClass_TO_KM3Class(__class, prj) {
	setIndentation(++indentation);
	trace(__class,indentString+"class "+__class.Name) ;
	
  //--- Documentation
	UMLDocumentation_TO_KM3Comment(__class.Documentation) ;
	
  //--- Class name and superclasses
	km3File.write(indentString);
	if (__class.isAbstract) {
		km3File.write("abstract ");
	}
	km3File.write("class "+UMLName_TO_KM3Name(__class.Name));
	searchGeneralization(__class, prj);
	km3File.writeline(" {");
  
  
  //--- Attributes
	for(var j = 0; j < __class.MOF_GetCollectionCount("Attributes"); j++){
		UMLAttribute_TO_KM3Attribute(__class.MOF_GetCollectionItem("Attributes",j));
	}

  //--- Constraints
  for(var j = 0; j < __class.MOF_GetCollectionCount("Constraints"); j++){
		UMLConstraint_TO_KM3Constraint(__class.MOF_GetCollectionItem("Constraints",j));
	}
  
  //--- Outgoing Associations
	searchAssociations(__class, prj);

  
	km3File.writeline(indentString+"} -- "+UMLName_TO_KM3Name(__class.Name));
	setIndentation(--indentation);
	km3File.writeline();
}

/* --------------------------------------------------------------------------------- */
/* browse the model to find generalization-typed associations         */
/* then call the idoine function to complete the header of the class */
/* --------------------------------------------------------------------------------- */
function searchGeneralization(__class, nameSpace) {
	var firstGene = true;
	for (var k = 0; k < nameSpace.GetOwnedElementCount(); k++) {
		insideElem = nameSpace.GetOwnedElementAt(k);
		if (insideElem.IsKindOf("UMLGeneralization")) {
			if (insideElem.Child.Name == __class.name) {
				if (firstGene == true) {
					km3File.write(" extends "+UMLName_TO_KM3Name(insideElem.Parent.Name));
					firstGene = false;
				}
				else {
					km3File.write(", "+UMLName_TO_KM3Name(insideElem.Parent.Name));
				}
			}
		}
		if (insideElem.IsKindOf("UMLNamespace")) {
			searchGeneralization(__class, insideElem);
		}
	}
}

/* ------------------------------------------------------- */
/* write the attributes in the body of the class */
/* ------------------------------------------------------- */
function UMLAttribute_TO_KM3Attribute (__attribute) {
	setIndentation(++indentation);
	trace(__attribute,indentString+"attribute  "+__attribute.Name) ;
	UMLDocumentation_TO_KM3Comment(__attribute.Documentation) ;
	km3File.writeline( indentString 
	                   +"attribute "
					   +UMLName_TO_KM3Name(__attribute.Name)
					   +" : "
					   +UMLTypeExpression_TO_KM3AttributeType(__attribute.typeExpression)
					   +";");
	setIndentation(--indentation);
}

function /*string*/ UMLTypeExpression_TO_KM3AttributeType(/*string*/ typeexpr) {
	/* XXX This could be improved */
	return typeexpr ;
}

/* ------------------------------------------------------------------------------------------ */
/* browse the model to find UML associations                                                 */
/* then call the function which transform the association into a reference */
/* ------------------------------------------------------------------------------------------- */
function searchAssociations(__class, nameSpace) {
	for (var k = 0; k < nameSpace.GetOwnedElementCount(); k++) {
		insideElem = nameSpace.GetOwnedElementAt(k);
		if (insideElem.IsKindOf("UMLAssociation")) {
			if (insideElem.GetConnectionAt(0).Participant.Name == __class.name) {
				UMLAssociation_TO_KM3Reference(__class, insideElem, 1);
			}
			if (insideElem.GetConnectionAt(1).Participant.Name == __class.name) {
				UMLAssociation_TO_KM3Reference(__class, insideElem, 0);
			}
		}
		if (insideElem.IsKindOf("UMLNamespace")) {
			searchAssociations(__class, insideElem);
		}
	}
}

/* ------------------------------------------------------------ */
/* turn a UML association into a KM3 reference */
/* ------------------------------------------------------------ */
function UMLAssociation_TO_KM3Reference(__class, __association, endNumber) {
	setIndentation(++indentation);

	directEnd = __association.getConnectionAt(endNumber);
	oppositeEnd = __association.getConnectionAt(switchEnd(endNumber));

	if (directEnd.isNavigable == 1) {
		trace(directEnd,indentString+"reference "+directEnd.Name) ;

		UMLDocumentation_TO_KM3Comment(directEnd.Documentation) ;
		km3File.write(indentString+"reference ");

		UMLRole_TO_KM3ReferenceName(directEnd);

		__multiplicity = UMLMultiplicity_TO_KM3Multiplicity(directEnd.multiplicity);
		km3File.write(__multiplicity+" ");

		if (directEnd.ordering == 1) {
			km3File.write("ordered ");
		}

		if (oppositeEnd.Aggregation == 2) {
			km3File.write("container ");
		}

		km3File.write(": "+directEnd.Participant.name);
		
		if (oppositeEnd.isNavigable == 1) {
			km3File.write(" oppositeOf ");

			UMLRole_TO_KM3ReferenceName(oppositeEnd);
		}
		
		km3File.writeline(";");
	}

	setIndentation(--indentation);
}

/* ---------------------------------------------------------------------------------------------------  */
/* transform the UML multiplicity into KM3 multiplicity */
/* ---------------------------------------------------------------------------------------------------  */
function UMLMultiplicity_TO_KM3Multiplicity(mult) {
	if (mult == "*") {
		return "[*]";
	} else if (mult == "1") {
		return "[1-1]";
	} else {
  // TODO improve this with correct parsing of UML multiplicity
		return "["+mult.charAt(0)+"-"+mult.charAt(3)+"]";
	}
}


function UMLRole_TO_KM3ReferenceName(/*AssociationEnd*/ role) {
  var /*string*/ name1 = role.name ;
	var /*string*/ name2 = role.Participant.name ;
	var /*string*/ refname ;
    /* if the UML hasn't a name, create it by "lower-casing" the first letter of the class name */
	if (name1 == "") {
		if (generateRoleNamesOpt) {
			refName = name2.charAt(0).toLowerCase()+name2.substr(1,name2.length);
		} else {
			error(role,"ERROR: this role is unamed. Name it or turn on the 'Generate Role Names' in the option section") ;
			refName = "<<unamed>>" ;
		}
	} else {
		refName = name1;
	}
	km3File.write(UMLName_TO_KM3Name(refName));
}


/** transform a UML enumeration into a KM3 enumeration
 **/
function UMLEnumeration_TO_KM3Enumeration(__enum) {
	setIndentation(++indentation);
	km3File.writeline(indentString+"enumeration "+UMLName_TO_KM3Name(__enum.Name)+" {");

	for( var j = 0; j < __enum.MOF_GetCollectionCount("Literals"); j++){
		UMLLiteral_TO_KM3Literal(__enum.MOF_GetCollectionItem("Literals",j));
	}

	km3File.writeline(indentString+"}");
	setIndentation(--indentation);
}


function /*void*/ UMLLiteral_TO_KM3Literal(/*UMLLiteral*/ __literal) {
	setIndentation(++indentation);
	km3File.writeline(indentString+"literal "+UMLName_TO_KM3Name(__literal.Name)+";");
	setIndentation(--indentation);
}

function /*void*/ UMLDocumentation_TO_KM3Comment(/*string*/ documentation){
    if (generateCommentsOpt) {
		if(documentation != ""){
			km3File.writeline(indentString+"-- "+documentation.replace(/\n/g,"\n"+indentString+"-- ")+"");
		}
	}
}	

function /*void*/ UMLConstraint_TO_KM3Constraint(/*Constraint*/ constraint){
  if (generateConstraintsOpt) {
    setIndentation(++indentation);
    km3File.writeline(indentString +"-- inv "+constraint.Name+": ") ;
    km3File.writeline(indentString +"--   "+constraint.Body.replace(/\n/g,"\n"+indentString+"--   "));
    setIndentation(--indentation);
	}
}	
			   
function /*string*/ UMLName_TO_KM3Name(/*string*/ umlname) {
    /* TODO: add quotes if the name contains suspisoucis characters and emit a warning
	
	/*  put double quotes in case of KM3 keyword  */
	for (var i = 0; i < keywordsArray.length; i++) {
		if (keywordsArray[i] == umlname) {
			return "\""+umlname+"\"";
		}
	}
	return umlname;
}



		/* ------- */
		/* helpers */
		/* ------- */

/* -------------------------------------------------------------------------- */
/* take the indentation level in parameter                                  */
/* and then create the indentation string with a series of '\t' */
/* -------------------------------------------------------------------------- */
function setIndentation(indentDeep) {
	indentString = "";
	for (var i = 0; i < indentDeep ; i++) {
		indentString += "    ";
	}
}


/* ------------------------------------------------------- */
/* this function help to generalise the treatment of the function */
/* which transform UML association to KM3 reference         */
/* it avoid to search if the number of the end was 0 or 1               */
/* into the function itself. See this function for more details      */
/* ------------------------------------------------------------------------------ */
function switchEnd(end) {
	return (end == 1) ? 0 : 1 ; 
}

/* -------------------------------------------------- */
/* return true if __attribute is in __array */
/* -------------------------------------------------- */
function attrInTab(__attribute, __array) {
	for (var i = 0; i < __array.length; i++) {
		if (__array[i] == __attribute) {
			return true;
		}
	}
	return false ;
}


function /*void*/ error(/*IElement*/ element, /*string*/ message) {
	errors++ ;
	staruml.AddMessageItem(0, message, element) ;
}


function /*void*/ trace(/*IElement*/ element, /*string*/ message) {
	staruml.AddMessageItem(1, message, element) ;
}

function /*void*/ startTrace() {
    staruml.ClearAllMessages() ;
}
