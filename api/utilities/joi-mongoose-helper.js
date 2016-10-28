var Joi = require('joi');
Joi.objectId = require('joi-objectid')(Joi);
var _ = require('lodash');
var assert = require('assert');
var validationHelper = require("./validation-helper");
var mongoose = require('mongoose');

//TODO: support "allowNull"

module.exports = {

  /**
   * Generates a Joi object that validates a query result for a specific model
   * @param model: A mongoose model object.
   * @param Log: A logging object.
   * @returns {*}: A Joi object
   */
  generateJoiReadModel: function (model, Log) {
    validationHelper.validateModel(model, Log);

    var readModelBase = {};

    var fields = model.schema.paths;

    var associations = model.schema.methods.routeOptions.associations ? Object.keys(model.schema.methods.routeOptions.associations) : [];

    for (var fieldName in fields) {
      var field = fields[fieldName].options;

      var isAssociation = associations.indexOf(fields[fieldName].path);

      if (field.readModel) {
        readModelBase[fieldName] = field.readModel;
      }
      else if (field.allowOnRead !== false && field.exclude !== true && isAssociation < 0 && fieldName !== "__v") {
        var attributeReadModel = this.generateJoiModelFromFieldType(field, Log);

        if (field.requireOnRead === true) {
          attributeReadModel = attributeReadModel.required();
        }
        else {
          attributeReadModel = attributeReadModel.optional();
        }

        readModelBase[fieldName] = attributeReadModel;
      }
    }

    var modelMethods = model.schema.methods;

    if (modelMethods.routeOptions && modelMethods.routeOptions.associations) {
      for (var associationName in modelMethods.routeOptions.associations) {
        var association = modelMethods.routeOptions.associations[associationName];

        //TODO: possibly add stricter validation for associations
        if (association.type === "MANY_MANY" || association.type === "ONE_MANY") {
          readModelBase[associationName] = Joi.array().items(Joi.object().unknown()).optional();
          if (association.linkingModel) {
            readModelBase[association.linkingModel] = Joi.object().unknown().allow(null).optional();
          }
        } else {
          readModelBase[associationName] = Joi.object().unknown().allow(null).optional();
        }
      }
    }

    var readModel = Joi.object(readModelBase).meta({
      className: model.modelName + "ReadModel"
    });

    return readModel;
  },

  /**
   * Generates a Joi object that validates a query request payload for updating a document
   * @param model: A mongoose model object.
   * @param Log: A logging object.
   * @returns {*}: A Joi object
   */
  generateJoiUpdateModel: function (model, Log) {
    validationHelper.validateModel(model, Log);

    var updateModelBase = {};

    var fields = model.schema.paths;

    var associations = model.schema.methods.routeOptions.associations ? model.schema.methods.routeOptions.associations : {};

    for (var fieldName in fields) {
      var field = fields[fieldName].options;

      var association = associations[fields[fieldName].path] || null;

      var canUpdateAssociation = association ? (association.type === "ONE_ONE" || association.type === "MANY_ONE") : false;

      if (fieldName !== "__t" && fieldName !== "__v") {
        if (field.updateModel) {
          updateModelBase[fieldName] = field.updateModel;
        }
        else if (field.allowOnUpdate !== false && (canUpdateAssociation || !association)) {
          var attributeUpdateModel = this.generateJoiModelFromFieldType(field, Log);

          if (field.requireOnUpdate === true) {
            attributeUpdateModel = attributeUpdateModel.required();
          } else {
            attributeUpdateModel = attributeUpdateModel.optional();
          }

          updateModelBase[fieldName] = attributeUpdateModel;
        }
      }
    }

    var updateModel = Joi.object(updateModelBase).meta({
      className: model.modelName + "UpdateModel"
    }).optional();

    return updateModel;
  },

  /**
   * Generates a Joi object that validates a query request payload for creating a document
   * @param model: A mongoose model object.
   * @param Log: A logging object.
   * @returns {*}: A Joi object
   */
  generateJoiCreateModel: function (model, Log) {
    validationHelper.validateModel(model, Log);

    var createModelBase = {};

    var fields = model.schema.paths;

    var associations = model.schema.methods.routeOptions.associations ? model.schema.methods.routeOptions.associations : {};

    for (var fieldName in fields) {

      var field = fields[fieldName].options;

      var association = associations[fields[fieldName].path] || null;

      var canCreateAssociation = association ? (association.type === "ONE_ONE" || association.type === "MANY_ONE") : false;

      if (fieldName !== "__t" && fieldName !== "__v") {
        if (field.createModel) {
          createModelBase[fieldName] = field.createModel;
        }
        else if (field.allowOnCreate !== false && (canCreateAssociation || !association)) {
          var attributeCreateModel = this.generateJoiModelFromFieldType(field, Log);

          if (field.required === true) {
            attributeCreateModel = attributeCreateModel.required();
          } else {
            attributeCreateModel = attributeCreateModel.optional();
          }

          createModelBase[fieldName] = attributeCreateModel;
        }
      }
    }

    var createModel = Joi.object(createModelBase).meta({
      className: model.modelName + "CreateModel"
    });

    return createModel;
  },

  /**
   * Generates a Joi object that validates a query request payload for adding a association
   * @param model: A mongoose model object.
   * @param Log: A logging object.
   * @returns {*}: A Joi object
   */
  generateJoiAssociationModel: function (model, Log) {
    assert(model.Schema, "incorrect model format");

    var associationModelBase = {};

    for (var fieldName in model.Schema) {

      var field = model.Schema[fieldName];

      if (field.createModel) {
        associationModelBase[fieldName] = field.createModel;
      }
      else {
        var attributeAssociationModel = this.generateJoiModelFromFieldType(field, Log);

        if (field.required) {
          attributeAssociationModel = attributeAssociationModel.required();
        }
        else {
          attributeAssociationModel = attributeAssociationModel.optional();
        }
        associationModelBase[fieldName] = attributeAssociationModel;
      }
    }

    var associationModel = Joi.object(associationModelBase).meta({
      className: model.modelName + "AssociationModel"
    });

    return associationModel;
  },

  /**
   * Returns a Joi object based on the mongoose field type.
   * @param field: A field from a mongoose model.
   * @param Log: A logging object.
   * @returns {*}: A Joi object.
   */
  generateJoiModelFromFieldType: function (field, Log) {
    var model;

    assert(field.type, "incorrect field format");

    switch (field.type.schemaName) {
      case 'ObjectId':
        model = Joi.objectId();
        break;
      case 'Boolean':
        model = Joi.bool();
        break;
      case 'Number':
        model = Joi.number();
        break;
      case 'Date':
        model = Joi.date();
        break;
      case 'String':
        if (field.enum) {
          model = Joi.any().only(field.enum);
        }
        else {
          model = Joi.string();
        }
        break;
      default:
        model = Joi.any();
        break;
    }

    if (field.allowNull) {
      model = model.allow(null);
    }

    return model;
  }

};